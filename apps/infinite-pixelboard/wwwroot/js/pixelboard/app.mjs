import { AccountState } from "./account-state.mjs";
import { AdController } from "./ads.mjs";
import { ApiError, PixelboardApi } from "./api.mjs";
import { ConnectionState } from "./connection-state.mjs";
import { authErrorMessage, createFirebaseAuthClient } from "./firebase-auth.mjs";
import { attachPointerControls } from "./pointer-controls.mjs";
import { PlacementReconciler } from "./reconciliation.mjs";
import { PixelRenderer } from "./renderer.mjs";
import { boundedReportRegion } from "./reporting.mjs";
import { PixelboardRealtimeClient } from "./realtime.mjs";
import { TileCache } from "./tile-cache.mjs";
import {
  createViewport,
  pan,
  screenToBoard,
  visibleTileRange,
  zoomAt,
} from "./viewport.mjs";

const COLORS = [
  "#171714",
  "#f7f3ea",
  "#d3523c",
  "#dc9b32",
  "#e1c94a",
  "#587554",
  "#356b76",
  "#425b8c",
  "#7e5078",
];

const root = document.querySelector("[data-pixelboard-app]");
if (root) start(root);

async function start(app) {
  const elements = collectElements(app);
  let selectedColor = COLORS[2];
  let viewport = createViewport(elements.canvas.clientWidth, elements.canvas.clientHeight);
  let renderer;
  let cache;
  let reconciler;
  let pointerControls;
  let frame = 0;
  let lastRange = "";
  let hoveredPixel = { row: 0, column: 0 };
  let visibleRange = null;
  let retryTimer = 0;
  let placementPending = false;
  let reportRegion = null;
  let realtime;

  const connection = new ConnectionState({
    onChange(state) {
      elements.connection.dataset.state = state;
      elements.connection.querySelector("strong").textContent = connectionLabel(state);
    },
  });
  const api = new PixelboardApi({
    getToken: () => globalThis.CollapsePixelboardAuth?.getToken?.() ?? null,
    onRequest: (event) => connection.request(event),
  });
  const ads = new AdController(app.querySelector("[data-ad-container]"));
  const accountState = new AccountState({ onChange: renderAccountState });
  let authUser = null;
  const authReady = initializeAuthentication();

  createPalette(elements.palette, selectedColor, (color) => {
    selectedColor = color;
    elements.colorPicker.value = color;
  });
  elements.colorPicker.addEventListener("input", () => {
    selectedColor = elements.colorPicker.value;
    markCustomColor(elements.palette);
  });
  attachPanel(elements);
  attachAuthentication();
  attachIntro(elements);
  attachReporting();

  try {
    const metadata = await api.metadata();
    cache = new TileCache({
      loadTile: (row, column, signal) => api.tile(row, column, signal),
      tileRows: metadata.tileRows,
      tileColumns: metadata.tileColumns,
      defaultColor: metadata.defaultColor,
    });
    renderer = new PixelRenderer(elements.canvas, {
      tileRows: metadata.tileRows,
      tileColumns: metadata.tileColumns,
      defaultColor: metadata.defaultColor,
    });
    realtime = new PixelboardRealtimeClient({
      onState: (state) => connection.realtime(state),
      onAcceptedPixel: (event) => {
        const pixel = event.data.pixel;
        if (cache.applyPixelIfLoaded(pixel.row, pixel.column, pixel.color)) {
          scheduleDraw();
        }
      },
      onConnected: async () => {
        if (!visibleRange) return;
        try {
          await cache.refreshVisible(visibleRange);
          scheduleDraw();
        } catch (error) {
          console.warn("Visible tiles could not be reconciled after reconnect.", error);
        }
      },
    });
    realtime.start();
    window.addEventListener("pagehide", () => realtime.stop());
    window.addEventListener("pageshow", (event) => {
      if (event.persisted) realtime.start();
    });
    reconciler = new PlacementReconciler({
      cache,
      place: (placement) => api.place(placement),
      onChange: handlePlacementChange,
    });
    renderer.resize();

    pointerControls = attachPointerControls(elements.canvas, {
      hover(x, y) {
        hoveredPixel = screenToBoard(viewport, x, y);
        pointerControls.setKeyboardPixel(hoveredPixel);
        elements.coordinate.textContent = formatCoordinate(hoveredPixel);
        scheduleDraw();
      },
      select(pixel) {
        hoveredPixel = pixel;
        elements.coordinate.textContent = formatCoordinate(pixel);
        scheduleDraw();
      },
      pan(deltaX, deltaY) {
        viewport = pan(viewport, deltaX, deltaY);
        scheduleDraw();
      },
      zoom(x, y, factor) {
        viewport = zoomAt(viewport, x, y, factor);
        scheduleDraw();
      },
      paint(x, y) {
        paint(screenToBoard(viewport, x, y));
      },
      paintBoard(pixel) {
        paint(pixel);
      },
    });

    elements.zoomIn.addEventListener("click", () => zoomFromCenter(1.25));
    elements.zoomOut.addEventListener("click", () => zoomFromCenter(1 / 1.25));
    elements.resetView.addEventListener("click", () => {
      viewport = createViewport(renderer.width, renderer.height);
      scheduleDraw();
    });
    window.addEventListener("resize", () => {
      renderer.resize();
      scheduleDraw();
    });
    window.setInterval(() => {
      if (!visibleRange || document.hidden) return;
      cache.refreshVisible(visibleRange).then(scheduleDraw);
    }, 5_000);

    reconciler.onChange = handlePlacementChange;
    await refreshAccount();
    scheduleDraw();
  } catch (error) {
    realtime?.stop();
    elements.placementStatus.textContent = "Board service unavailable";
    console.error("Pixelboard failed to initialize.", error);
  }

  elements.acceptStandards.addEventListener("click", async () => {
    elements.authNote.textContent = "Recording your acceptance…";
    try {
      await api.acceptCommunityStandards();
      await refreshAccount();
      elements.authNote.textContent = "Community standards accepted. You can place pixels.";
    } catch (error) {
      elements.authNote.textContent = error.message;
    }
  });

  function scheduleDraw() {
    if (frame || !renderer) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const range = renderer.draw(viewport, cache, hoveredPixel, reportRegion);
      visibleRange = range;
      elements.zoom.textContent = `${Math.round(viewport.scale * 100)}%`;
      const rangeKey = JSON.stringify(range);
      if (rangeKey !== lastRange) {
        lastRange = rangeKey;
        cache.ensureVisible(range).then(() => {
          scheduleDraw();
          if (!cache.hasAll(range)) {
            clearTimeout(retryTimer);
            retryTimer = window.setTimeout(() => {
              lastRange = "";
              scheduleDraw();
            }, 3_000);
          }
        });
      }
    });
  }

  function zoomFromCenter(factor) {
    viewport = zoomAt(viewport, renderer.width / 2, renderer.height / 2, factor);
    scheduleDraw();
  }

  async function paint(pixel) {
    const state = accountState.snapshot;
    if (!state.authenticated) {
      elements.placementStatus.textContent = "Sign in to place a pixel";
      openPanel(elements);
      return;
    }
    if (placementPending) {
      elements.placementStatus.textContent = "Placement already in progress";
      return;
    }
    if (!state.communityStandardsAccepted) {
      elements.placementStatus.textContent = "Accept the community standards first";
      openPanel(elements);
      return;
    }
    if (!state.canPlace) {
      elements.placementStatus.textContent = `Cooldown · ${state.remainingSeconds}s`;
      return;
    }
    try {
      await reconciler.submit({ ...pixel, color: selectedColor });
    } catch (error) {
      if (error instanceof ApiError && error.payload?.cooldown) {
        accountState.setCooldown(error.payload.cooldown);
      }
    }
  }

  function handlePlacementChange(event) {
    if (event.state === "pending") {
      placementPending = true;
      elements.placementStatus.textContent = "Reconciling placement…";
    } else if (event.state === "accepted") {
      placementPending = false;
      elements.placementStatus.textContent = "Pixel placed";
      accountState.setCooldown(event.result.cooldown);
    } else {
      placementPending = false;
      elements.placementStatus.textContent = event.error?.message ?? "Placement rejected";
    }
    scheduleDraw();
  }

  async function refreshAccount() {
    try {
      accountState.setAccount(await api.account());
    } catch (error) {
      if (error.status === 401) accountState.setAccount(null);
      else elements.authNote.textContent = "Account state is temporarily unavailable.";
    }
  }

  async function initializeAuthentication() {
    try {
      const client = await createFirebaseAuthClient();
      globalThis.CollapsePixelboardAuth = client;
      client.subscribe(async (user) => {
        authUser = user;
        renderAuthentication();
        await refreshAccount();
      });
      return client;
    } catch (error) {
      console.error("Firebase Authentication failed to initialize.", error);
      elements.authNote.textContent =
        "Secure sign-in is temporarily unavailable. The board remains open for viewing.";
      return null;
    }
  }

  function attachAuthentication() {
    for (const button of elements.loginButtons) {
      button.addEventListener("click", async () => {
        setAuthControlsDisabled(true);
        elements.authNote.textContent = "Opening secure sign-in…";
        try {
          const client = await authReady;
          if (!client) throw new Error("authentication_unavailable");
          await client.signIn(button.dataset.loginProvider);
        } catch (error) {
          elements.authNote.textContent = error.message === "authentication_unavailable"
            ? "Secure sign-in is temporarily unavailable."
            : authErrorMessage(error);
        } finally {
          setAuthControlsDisabled(false);
        }
      });
    }
    elements.signOut.addEventListener("click", async () => {
      setAuthControlsDisabled(true);
      elements.authNote.textContent = "Signing out…";
      try {
        const client = await authReady;
        await client?.signOut();
      } catch (error) {
        elements.authNote.textContent = "Sign-out could not be completed.";
      } finally {
        setAuthControlsDisabled(false);
      }
    });
  }

  function renderAuthentication() {
    for (const button of elements.loginButtons) button.hidden = Boolean(authUser);
    elements.signOut.hidden = !authUser;
    elements.authNote.textContent = authUser
      ? `Signed in as ${authUser.email ?? "a verified account"}.`
      : "Sign in with Google or Apple to place pixels.";
  }

  function setAuthControlsDisabled(disabled) {
    for (const button of [...elements.loginButtons, elements.signOut]) {
      button.disabled = disabled;
    }
  }

  function renderAccountState(state) {
    ads.update(state.tier);
    elements.accountState.textContent = state.authenticated
      ? `${state.tier ?? "Free"} account`
      : "Anonymous";
    elements.cooldown.textContent = state.remainingSeconds ? `${state.remainingSeconds}s` : "Ready";
    elements.acceptStandards.hidden = !state.authenticated || state.communityStandardsAccepted;
    if (!state.authenticated) {
      elements.placementStatus.textContent = "Viewing anonymously";
    } else if (state.remainingSeconds) {
      elements.placementStatus.textContent = `Cooldown · ${state.remainingSeconds}s`;
    } else {
      elements.placementStatus.textContent = state.canPlace ? "Ready to place" : "Account action required";
    }
  }

  function attachReporting() {
    elements.reportOpen.addEventListener("click", () => {
      if (!accountState.snapshot.authenticated) {
        elements.placementStatus.textContent = "Sign in to report this position";
        openPanel(elements);
        return;
      }
      updateReportRegion();
      elements.reportStatus.textContent = "";
      elements.reportDialog.showModal();
      elements.reportReason.focus();
    });
    elements.reportClose.addEventListener("click", closeReport);
    elements.reportDialog.addEventListener("close", () => {
      reportRegion = null;
      scheduleDraw();
    });
    elements.reportWidth.addEventListener("input", updateReportRegion);
    elements.reportHeight.addEventListener("input", updateReportRegion);
    elements.reportForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      updateReportRegion();
      elements.reportStatus.textContent = "Submitting report…";
      elements.reportSubmit.disabled = true;
      try {
        const response = await api.report({
          region: reportRegion,
          reason: Number(elements.reportReason.value),
          note: elements.reportNote.value.trim(),
        });
        elements.reportStatus.textContent = `Report received · ${reportId(response.reportId)}`;
        elements.reportForm.reset();
        window.setTimeout(closeReport, 1_500);
      } catch (error) {
        elements.reportStatus.textContent = error.message ?? "Report could not be submitted.";
      } finally {
        elements.reportSubmit.disabled = false;
      }
    });
  }

  function updateReportRegion() {
    reportRegion = boundedReportRegion(
      hoveredPixel,
      elements.reportWidth.value,
      elements.reportHeight.value,
    );
    elements.reportWidth.value = String(reportRegion.width);
    elements.reportHeight.value = String(reportRegion.height);
    elements.reportRegion.textContent =
      `${formatCoordinate({ row: reportRegion.top, column: reportRegion.left })} · ` +
      `${reportRegion.width} × ${reportRegion.height}`;
    scheduleDraw();
  }

  function closeReport() {
    if (elements.reportDialog.open) elements.reportDialog.close();
    elements.reportOpen.focus();
  }
}

function collectElements(app) {
  return {
    canvas: app.querySelector("#board-canvas"),
    palette: app.querySelector("[data-palette]"),
    colorPicker: app.querySelector("[data-color-picker]"),
    coordinate: app.querySelector("[data-coordinate]"),
    zoom: app.querySelector("[data-zoom]"),
    zoomIn: app.querySelector("[data-zoom-in]"),
    zoomOut: app.querySelector("[data-zoom-out]"),
    resetView: app.querySelector("[data-reset-view]"),
    connection: app.querySelector("[data-connection]"),
    placementStatus: app.querySelector("[data-placement-status]"),
    panel: app.querySelector("[data-account-panel]"),
    panelToggle: app.querySelector("[data-panel-toggle]"),
    panelClose: app.querySelector("[data-panel-close]"),
    panelScrim: app.querySelector("[data-panel-scrim]"),
    accountState: app.querySelector("[data-account-state]"),
    cooldown: app.querySelector("[data-cooldown]"),
    authNote: app.querySelector("[data-auth-note]"),
    loginButtons: [...app.querySelectorAll("[data-login-provider]")],
    signOut: app.querySelector("[data-sign-out]"),
    acceptStandards: app.querySelector("[data-accept-standards]"),
    intro: app.querySelector("[data-intro]"),
    dismissIntro: app.querySelector("[data-dismiss-intro]"),
    reportOpen: app.querySelector("[data-report-open]"),
    reportDialog: app.querySelector("[data-report-dialog]"),
    reportClose: app.querySelector("[data-report-close]"),
    reportForm: app.querySelector("[data-report-form]"),
    reportWidth: app.querySelector("[data-report-width]"),
    reportHeight: app.querySelector("[data-report-height]"),
    reportReason: app.querySelector("[data-report-reason]"),
    reportNote: app.querySelector("[data-report-note]"),
    reportRegion: app.querySelector("[data-report-region]"),
    reportStatus: app.querySelector("[data-report-status]"),
    reportSubmit: app.querySelector("[data-report-form] button[type='submit']"),
  };
}

function createPalette(container, selectedColor, onSelect) {
  for (const color of COLORS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "swatch";
    button.style.backgroundColor = color;
    button.setAttribute("role", "radio");
    button.setAttribute("aria-label", color);
    button.setAttribute("aria-checked", String(color === selectedColor));
    button.addEventListener("click", () => {
      for (const swatch of container.querySelectorAll(".swatch")) {
        swatch.setAttribute("aria-checked", String(swatch === button));
      }
      onSelect(color);
    });
    container.append(button);
  }
}

function markCustomColor(container) {
  for (const swatch of container.querySelectorAll(".swatch")) {
    swatch.setAttribute("aria-checked", "false");
  }
}

function attachIntro(elements) {
  if (sessionStorage.getItem("pixelboard:intro-dismissed")) {
    elements.intro.hidden = true;
  }
  elements.dismissIntro.addEventListener("click", () => {
    elements.intro.classList.add("is-dismissed");
    sessionStorage.setItem("pixelboard:intro-dismissed", "true");
    elements.intro.hidden = true;
    elements.canvas.focus();
  });
}

function attachPanel(elements) {
  elements.panelToggle.addEventListener("click", () => openPanel(elements));
  elements.panelClose.addEventListener("click", () => closePanel(elements));
  elements.panelScrim.addEventListener("click", () => closePanel(elements));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && elements.panel.classList.contains("is-open")) {
      closePanel(elements);
    }
  });
}

function openPanel(elements) {
  elements.panel.classList.add("is-open");
  elements.panel.removeAttribute("inert");
  elements.panel.setAttribute("aria-hidden", "false");
  elements.panelToggle.setAttribute("aria-expanded", "true");
  elements.panelScrim.hidden = false;
  elements.panelClose.focus();
}

function closePanel(elements) {
  elements.panel.classList.remove("is-open");
  elements.panel.setAttribute("inert", "");
  elements.panel.setAttribute("aria-hidden", "true");
  elements.panelToggle.setAttribute("aria-expanded", "false");
  elements.panelScrim.hidden = true;
  elements.panelToggle.focus();
}

function formatCoordinate({ row, column }) {
  return `ROW ${signed(row)} / COL ${signed(column)}`;
}

function signed(value) {
  return `${value < 0 ? "−" : "+"}${String(Math.abs(value)).padStart(4, "0")}`;
}

function reportId(value) {
  return typeof value === "string" ? value : value?.value ?? "receipt recorded";
}

function connectionLabel(state) {
  return {
    connecting: "Connecting",
    online: "Live",
    degraded: "Retrying",
    offline: "Offline",
  }[state];
}
