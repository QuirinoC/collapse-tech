import { AccountState } from "./account-state.mjs";
import { AdController, isProTier } from "./ads.mjs";
import { ApiError, PixelboardApi } from "./api.mjs";
import { ConnectionState } from "./connection-state.mjs";
import { authErrorMessage, createFirebaseAuthClient } from "./firebase-auth.mjs";
import { attachPointerControls } from "./pointer-controls.mjs";
import { PlacementReconciler } from "./reconciliation.mjs";
import { PixelRenderer } from "./renderer.mjs";
import {
  capturePendingReferral,
  clearPendingReferral,
  inviteUrl,
  normalizeReferralCode,
  parseBoardPosition,
  peekPendingReferral,
  positionUrl,
} from "./invite.mjs";
import {
  billingStatusMessage,
  parseBillingReturn,
  stripBillingParam,
} from "./billing.mjs";
import { boundedReportRegion, otherReasonRequiresNote } from "./reporting.mjs";
import { PixelboardRealtimeClient } from "./realtime.mjs";
import { TileCache } from "./tile-cache.mjs";
import {
  centerOn,
  createViewport,
  pan,
  readSavedView,
  screenToBoard,
  writeSavedView,
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
  let advertisingRequest = 0;
  let accountRequest = 0;
  let advertisingTier = Symbol("uninitialized");
  let advertisingTimer = 0;

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
  let inviteStorage = window.localStorage;
  let boardMetadata = null;
  let pendingReferral = capturePendingReferral(window.location.search, inviteStorage);
  let billingReturn = parseBillingReturn(window.location.search);
  let stripeEnabled = false;
  let stripeHasCustomer = false;
  const deepLink = parseBoardPosition(window.location.search);
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
  attachReporting();
  attachSharing();
  attachInvites();
  attachBilling();
  if (billingReturn) openPanel(elements);

  try {
    const metadata = await api.metadata();
    boardMetadata = metadata;
    if (!isBoardOpen(metadata)) {
      elements.placementStatus.textContent = metadata.statusMessage || "Painting is paused.";
    }
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
    window.addEventListener("pagehide", () => {
      persistView();
      realtime.stop();
    });
    window.addEventListener("pageshow", (event) => {
      if (event.persisted) realtime.start();
    });
    reconciler = new PlacementReconciler({
      cache,
      place: (placement) => api.place(placement),
      onChange: handlePlacementChange,
    });
    renderer.resize();
    if (deepLink) {
      viewport = centerOn(
        viewport,
        deepLink.row,
        deepLink.column,
        renderer.width,
        renderer.height,
      );
      hoveredPixel = deepLink;
      elements.coordinate.textContent = formatCoordinate(hoveredPixel);
    } else {
      const saved = readSavedView(inviteStorage);
      if (saved) {
        viewport = centerOn(
          createViewport(renderer.width, renderer.height, saved.scale),
          saved.row,
          saved.column,
          renderer.width,
          renderer.height,
        );
        hoveredPixel = { row: saved.row, column: saved.column };
        elements.coordinate.textContent = formatCoordinate(hoveredPixel);
      }
    }

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
      persistView();
      scheduleDraw();
    });
    window.addEventListener("resize", () => {
      const previousWidth = renderer.width;
      const previousHeight = renderer.height;
      renderer.resize();
      if (previousWidth && previousHeight) {
        const focus = screenToBoard(viewport, previousWidth / 2, previousHeight / 2);
        viewport = centerOn(
          viewport,
          focus.row,
          focus.column,
          renderer.width,
          renderer.height,
        );
      }
      persistView();
      scheduleDraw();
    });
    window.setInterval(() => {
      persistView();
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
      await redeemPendingInvite();
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

  function persistView() {
    if (!renderer) return;
    const center = screenToBoard(viewport, renderer.width / 2, renderer.height / 2);
    writeSavedView(inviteStorage, {
      row: center.row,
      column: center.column,
      scale: viewport.scale,
      offsetX: viewport.offsetX,
      offsetY: viewport.offsetY,
    });
  }

  async function paint(pixel) {
    if (!isBoardOpen(boardMetadata)) {
      elements.placementStatus.textContent =
        boardMetadata?.statusMessage || "Painting is paused.";
      return;
    }
    const state = accountState.snapshot;
    if (!state.authenticated) {
      elements.placementStatus.textContent = "Sign in to place a pixel";
      openPanel(elements, { focus: elements.loginButtons[0] });
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
    if (state.isBanned) {
      elements.placementStatus.textContent = "This account is banned from placing pixels.";
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
    const request = ++accountRequest;
    try {
      const account = await api.account();
      if (request === accountRequest) accountState.setAccount(account);
    } catch (error) {
      if (request !== accountRequest) return;
      if (error.status === 401) accountState.setAccount(null);
      else elements.authNote.textContent = "Account state is temporarily unavailable.";
    }
  }

  async function initializeAuthentication() {
    try {
      const client = await createFirebaseAuthClient();
      globalThis.CollapsePixelboardAuth = client;
      client.subscribe(async (user) => {
        invalidateAdvertising();
        accountState.setAccount(null);
        authUser = user;
        renderAuthentication();
        await refreshAccount();
        await refreshBillingStatus();
        await redeemPendingInvite();
        applyBillingReturn();
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
    refreshAdvertising(state.tier);
    elements.accountState.textContent = !state.authenticated
      ? "Anonymous"
      : state.isBanned
        ? "Banned"
        : `${state.tier ?? "Free"} account`;
    elements.cooldown.textContent = state.remainingSeconds ? `${state.remainingSeconds}s` : "Ready";
    elements.acceptStandards.hidden = !state.authenticated || state.communityStandardsAccepted;
    renderInvite(state);
    renderBilling(state);
    if (elements.accountHeading) {
      elements.accountHeading.innerHTML = state.authenticated
        ? "Your<br />account."
        : "Sign in<br />to paint.";
    }
    if (!state.authenticated) {
      elements.placementStatus.textContent = "Viewing anonymously";
    } else if (state.isBanned) {
      elements.placementStatus.textContent = "This account is banned from placing pixels.";
    } else if (state.remainingSeconds) {
      elements.placementStatus.textContent = `Cooldown · ${state.remainingSeconds}s`;
    } else {
      elements.placementStatus.textContent = state.canPlace ? "Ready to place" : "Account action required";
    }
  }

  function invalidateAdvertising() {
    advertisingRequest += 1;
    clearTimeout(advertisingTimer);
    advertisingTimer = 0;
    advertisingTier = Symbol("uninitialized");
    ads.update(accountState.snapshot.tier, false);
  }

  async function refreshAdvertising(tier, force = false) {
    if (!force && Object.is(tier, advertisingTier)) return;
    advertisingTier = tier;
    clearTimeout(advertisingTimer);
    const request = ++advertisingRequest;
    ads.update(tier, false);
    try {
      const decision = await api.advertising();
      if (request === advertisingRequest) {
        ads.update(tier, decision?.showAd === true);
      }
    } catch {
      // Advertising fails closed when the runtime safety decision is unavailable.
    } finally {
      if (request === advertisingRequest) {
        advertisingTimer = setTimeout(
          () => refreshAdvertising(advertisingTier, true),
          30_000,
        );
      }
    }
  }

  function attachReporting() {
    elements.reportOpen.addEventListener("click", () => {
      if (!accountState.snapshot.authenticated) {
        elements.placementStatus.textContent = "Sign in to report this position";
        elements.authNote.textContent = "Sign in to report this position";
        return;
      }
      closePanel(elements, { restoreFocus: false });
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
    elements.reportReason.addEventListener("change", syncReportNoteRequirement);
    syncReportNoteRequirement();
    elements.reportForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      updateReportRegion();
      if (otherReasonRequiresNote(elements.reportReason.value, elements.reportNote.value)) {
        elements.reportStatus.textContent = "Add a note when the reason is Other.";
        return;
      }
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
    elements.panelToggle.focus();
  }

  function syncReportNoteRequirement() {
    const required = Number(elements.reportReason.value) === 6;
    elements.reportNoteHint.textContent = required
      ? "Required · 500 characters"
      : "Optional · 500 characters";
    elements.reportNote.required = required;
  }

  async function redeemPendingInvite() {
    const code = peekPendingReferral(inviteStorage) ?? pendingReferral;
    if (!code || !accountState.snapshot.communityStandardsAccepted) return;
    try {
      await api.claimReferral(code);
      pendingReferral = null;
      clearPendingReferral(inviteStorage);
      elements.inviteStatus.textContent = "Invite applied. Faster painting is on for a few hours.";
      await refreshAccount();
    } catch (error) {
      if (error.code === "referral_already_claimed" || error.code === "referral_own_code") {
        pendingReferral = null;
        clearPendingReferral(inviteStorage);
      }
      if (error.code !== "community_standards_required") {
        elements.inviteStatus.textContent = error.message ?? "Invite could not be applied.";
      }
    }
  }

  function attachSharing() {
    elements.sharePosition.addEventListener("click", async () => {
      const url = positionUrl(hoveredPixel.row, hoveredPixel.column);
      try {
        await navigator.clipboard.writeText(url);
        elements.placementStatus.textContent = "Position link copied";
        elements.authNote.textContent = "Position link copied.";
      } catch {
        elements.placementStatus.textContent = url;
        elements.authNote.textContent = url;
      }
    });
  }

  function attachInvites() {
    elements.copyInvite.addEventListener("click", async () => {
      const code = accountState.snapshot.referralCode;
      if (!code) return;
      try {
        await navigator.clipboard.writeText(inviteUrl(code));
        elements.inviteStatus.textContent = "Invite link copied.";
      } catch {
        elements.inviteStatus.textContent = inviteUrl(code);
      }
    });
    elements.redeemInvite.addEventListener("click", async () => {
      const code = normalizeReferralCode(elements.redeemCode.value);
      if (!code) {
        elements.inviteStatus.textContent = "Enter an 8-character invite code.";
        return;
      }
      pendingReferral = code;
      capturePendingReferral(`?ref=${code}`, inviteStorage);
      await redeemPendingInvite();
    });
  }

  function renderInvite(state) {
    const visible = Boolean(
      state.authenticated && state.communityStandardsAccepted && !state.isBanned,
    );
    elements.inviteBlock.hidden = !visible;
    if (state.referralCode) elements.inviteCode.textContent = state.referralCode;
    if (state.paintBoost?.expiresAt) {
      const remaining = Math.max(0, Date.parse(state.paintBoost.expiresAt) - Date.now());
      const hours = Math.ceil(remaining / 3_600_000);
      elements.boostState.textContent =
        `${state.paintBoost.cooldownSeconds}s cooldown · ${hours}h left`;
    } else {
      elements.boostState.textContent = "None";
    }
  }

  function attachBilling() {
    if (!elements.billingMonth || !elements.billingYear || !elements.billingPortal) {
      return;
    }
    api.stripeConfig().then(async (config) => {
      stripeEnabled = config?.enabled === true;
      if (stripeEnabled && accountState.snapshot.authenticated) {
        await refreshBillingStatus();
        return;
      }
      renderBilling(accountState.snapshot);
    }).catch(() => {
      stripeEnabled = false;
    });
    elements.billingMonth.addEventListener("click", () => startCheckout("month"));
    elements.billingYear.addEventListener("click", () => startCheckout("year"));
    elements.billingPortal.addEventListener("click", startPortal);
  }

  async function refreshBillingStatus() {
    if (!stripeEnabled || !accountState.snapshot.authenticated) {
      stripeHasCustomer = false;
      renderBilling(accountState.snapshot);
      return;
    }
    try {
      const status = await api.stripeStatus();
      stripeHasCustomer = status?.hasCustomer === true;
    } catch {
      stripeHasCustomer = false;
    }
    renderBilling(accountState.snapshot);
  }

  async function startCheckout(interval) {
    elements.billingStatus.textContent = "Opening Stripe Checkout…";
    setBillingDisabled(true);
    try {
      const session = await api.createStripeCheckoutSession(interval);
      if (session?.url) {
        window.location.assign(session.url);
        return;
      }
      elements.billingStatus.textContent = "Checkout could not be started.";
    } catch (error) {
      elements.billingStatus.textContent = error.message ?? "Checkout could not be started.";
    } finally {
      setBillingDisabled(false);
    }
  }

  async function startPortal() {
    elements.billingStatus.textContent = "Opening billing settings…";
    setBillingDisabled(true);
    try {
      const session = await api.createStripePortalSession();
      if (session?.url) {
        window.location.assign(session.url);
        return;
      }
      elements.billingStatus.textContent = "Billing settings could not be opened.";
    } catch (error) {
      elements.billingStatus.textContent = error.message ?? "Billing settings could not be opened.";
    } finally {
      setBillingDisabled(false);
    }
  }

  function setBillingDisabled(disabled) {
    elements.billingMonth.disabled = disabled;
    elements.billingYear.disabled = disabled;
    elements.billingPortal.disabled = disabled;
  }

  function applyBillingReturn() {
    if (!billingReturn) return;
    elements.billingStatus.textContent = billingStatusMessage(billingReturn, {
      hasCustomer: stripeHasCustomer,
      isPro: isProTier(accountState.snapshot.tier),
    });
    billingReturn = null;
    history.replaceState({}, "", stripBillingParam(`${window.location.pathname}${window.location.search}${window.location.hash}`));
  }

  function renderBilling(state) {
    if (!elements.billingBlock) return;
    const visible = Boolean(
      stripeEnabled
        && state.authenticated
        && state.communityStandardsAccepted
        && !state.isBanned,
    );
    elements.billingBlock.hidden = !visible;
    if (!visible) return;
    const isPro = isProTier(state.tier);
    elements.billingMonth.hidden = isPro;
    elements.billingYear.hidden = isPro;
    elements.billingPortal.hidden = !stripeHasCustomer;
    if (isPro && !stripeHasCustomer && !elements.billingStatus.textContent) {
      elements.billingStatus.textContent =
        "Pro is on through Apple. Manage it in iPhone Settings → Apple ID → Subscriptions.";
    }
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
    accountHeading: app.querySelector("[data-account-heading]"),
    loginButtons: [...app.querySelectorAll("[data-login-provider]")],
    signOut: app.querySelector("[data-sign-out]"),
    acceptStandards: app.querySelector("[data-accept-standards]"),
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
    reportNoteHint: app.querySelector("[data-report-note-hint]"),
    sharePosition: app.querySelector("[data-share-position]"),
    inviteBlock: app.querySelector("[data-invite-block]"),
    inviteCode: app.querySelector("[data-invite-code]"),
    copyInvite: app.querySelector("[data-copy-invite]"),
    redeemCode: app.querySelector("[data-redeem-code]"),
    redeemInvite: app.querySelector("[data-redeem-invite]"),
    inviteStatus: app.querySelector("[data-invite-status]"),
    boostState: app.querySelector("[data-boost-state]"),
    billingBlock: app.querySelector("[data-billing-block]"),
    billingMonth: app.querySelector("[data-billing-month]"),
    billingYear: app.querySelector("[data-billing-year]"),
    billingPortal: app.querySelector("[data-billing-portal]"),
    billingStatus: app.querySelector("[data-billing-status]"),
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

function openPanel(elements, { focus } = {}) {
  elements.panel.classList.add("is-open");
  elements.panel.removeAttribute("inert");
  elements.panel.setAttribute("aria-hidden", "false");
  elements.panelToggle.setAttribute("aria-expanded", "true");
  elements.panelScrim.hidden = false;
  (focus ?? elements.panelClose).focus();
}

function closePanel(elements, { restoreFocus = true } = {}) {
  elements.panel.classList.remove("is-open");
  elements.panel.setAttribute("inert", "");
  elements.panel.setAttribute("aria-hidden", "true");
  elements.panelToggle.setAttribute("aria-expanded", "false");
  elements.panelScrim.hidden = true;
  if (restoreFocus) elements.panelToggle.focus();
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

function isBoardOpen(metadata) {
  return metadata?.accessMode === 0 || metadata?.accessMode === "open";
}

function connectionLabel(state) {
  return {
    connecting: "Syncing",
    online: "Live",
    degraded: "Retrying",
    offline: "Offline",
  }[state];
}
