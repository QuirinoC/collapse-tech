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
import { canPurchaseStripe, subscriptionMessage } from "./subscription.mjs";
import { boundedReportRegion, otherReasonRequiresNote } from "./reporting.mjs";
import { PixelboardRealtimeClient } from "./realtime.mjs";
import { TileCache } from "./tile-cache.mjs";
import {
  FREE_COLORS,
  colorName,
  colorsForState,
  customColorsAllowed,
} from "./palette.mjs";
import {
  centerOn,
  createViewport,
  pan,
  readSavedView,
  screenToBoard,
  writeSavedView,
  zoomAt,
} from "./viewport.mjs";

const root = document.querySelector("[data-pixelboard-app]");
if (root) start(root);

async function start(app) {
  const elements = collectElements(app);
  let selectedColor = FREE_COLORS[1];
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
  let billingRequest = 0;
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
  let stripeTrialAvailable = false;
  let stripeCurrentInterval = null;
  const deepLink = parseBoardPosition(window.location.search);
  const authReady = initializeAuthentication();

  createPalette(elements.palette, FREE_COLORS, selectedColor, (color) => {
    selectedColor = color;
    elements.colorPicker.value = color;
  });
  elements.proColor.addEventListener("click", () => {
    openPanel(elements);
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
    pointerControls.setKeyboardPixel(hoveredPixel);

    elements.zoomIn.addEventListener("click", () => zoomFromCenter(1.25));
    elements.zoomOut.addEventListener("click", () => zoomFromCenter(1 / 1.25));
    elements.locateOpen.addEventListener("click", () => {
      openLocateDialog(hoveredPixel);
    });
    elements.locateOrigin.addEventListener("click", () => {
      centerBoardAt(0, 0);
      elements.locateDialog.close();
    });
    elements.locateSelected.addEventListener("click", () => {
      centerBoardAt(hoveredPixel.row, hoveredPixel.column);
      elements.locateDialog.close();
    });
    elements.locateClose.addEventListener("click", () => elements.locateDialog.close());
    elements.locateForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const row = Number(elements.locateRow.value);
      const column = Number(elements.locateColumn.value);
      if (!Number.isSafeInteger(row) || !Number.isSafeInteger(column)) {
        elements.locateStatus.textContent = "Enter whole-number coordinates.";
        return;
      }
      centerBoardAt(row, column);
      elements.locateDialog.close();
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
    console.error("Pixelboard failed to initialize.", error);
  }

  elements.acceptStandards.addEventListener("click", async () => {
    try {
      await api.acceptCommunityStandards();
      await refreshAccount();
      await redeemPendingInvite();
    } catch (error) {
      console.error("Community standards could not be accepted.", error);
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

  function openLocateDialog(position) {
    elements.locateRow.value = String(position.row);
    elements.locateColumn.value = String(position.column);
    elements.locateStatus.textContent = "";
    elements.locateDialog.showModal();
    elements.locateRow.focus();
  }

  function centerBoardAt(row, column) {
    viewport = centerOn(
      viewport,
      row,
      column,
      renderer.width,
      renderer.height,
    );
    hoveredPixel = { row, column };
    pointerControls.setKeyboardPixel(hoveredPixel);
    elements.coordinate.textContent = formatCoordinate(hoveredPixel);
    persistView();
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
      return;
    }
    const state = accountState.snapshot;
    if (!state.authenticated) {
      openPanel(elements, { focus: elements.loginButtons[0] });
      return;
    }
    if (placementPending) {
      return;
    }
    if (!state.communityStandardsAccepted) {
      openPanel(elements);
      return;
    }
    if (state.isBanned) {
      openPanel(elements);
      return;
    }
    if (!state.canPlace) {
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
    } else if (event.state === "accepted") {
      placementPending = false;
      accountState.setCooldown(event.result.cooldown);
    } else {
      placementPending = false;
      console.warn("Placement rejected.", event.error);
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
      else console.warn("Account state is temporarily unavailable.", error);
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
      return null;
    }
  }

  function attachAuthentication() {
    for (const button of elements.loginButtons) {
      button.addEventListener("click", async () => {
        setAuthControlsDisabled(true);
        try {
          const client = await authReady;
          if (!client) throw new Error("authentication_unavailable");
          await client.signIn(button.dataset.loginProvider);
        } catch (error) {
          console.warn(
            error.message === "authentication_unavailable"
              ? "Secure sign-in is temporarily unavailable."
              : authErrorMessage(error),
          );
        } finally {
          setAuthControlsDisabled(false);
        }
      });
    }
    elements.signOut.addEventListener("click", async () => {
      setAuthControlsDisabled(true);
      try {
        const client = await authReady;
        await client?.signOut();
      } catch (error) {
        console.warn("Sign-out could not be completed.", error);
      } finally {
        setAuthControlsDisabled(false);
      }
    });
    elements.deleteAccount.addEventListener("click", async () => {
      if (!window.confirm("Permanently delete this account?")) return;
      setAuthControlsDisabled(true);
      try {
        const client = await authReady;
        await api.deleteAccount();
        await client?.deleteAccount();
      } catch (error) {
        console.warn("Account deletion could not be completed.", error);
        setAuthControlsDisabled(false);
      }
    });
  }

  function renderAuthentication() {
    for (const button of elements.loginButtons) button.hidden = Boolean(authUser);
    elements.signOut.hidden = !authUser;
    elements.deleteAccount.hidden = !authUser;
  }

  function setAuthControlsDisabled(disabled) {
    for (const button of [...elements.loginButtons, elements.signOut, elements.deleteAccount]) {
      button.disabled = disabled;
    }
  }

  function renderAccountState(state) {
    renderPalette(state);
    refreshAdvertising(state.tier);
    elements.acceptStandards.hidden = !state.authenticated || state.communityStandardsAccepted;
    renderPlacementHint(state);
    renderInvite(state);
    renderBilling(state);
  }

  function renderPlacementHint(state) {
    if (!elements.placementHint) return;
    if (state.authenticated && state.remainingSeconds > 0) {
      elements.placementHint.hidden = false;
      elements.placementHint.textContent = `Ready in ${state.remainingSeconds}s`;
      return;
    }
    elements.placementHint.hidden = true;
    elements.placementHint.textContent = "";
  }

  function renderPalette(state) {
    const isPro = customColorsAllowed(state);
    const colors = colorsForState(state);
    if (!isPro && !colors.some((color) => color.toLowerCase() === selectedColor.toLowerCase())) {
      selectedColor = colors[0];
    }
    elements.palette.replaceChildren();
    createPalette(elements.palette, colors, selectedColor, (color) => {
      selectedColor = color;
      elements.colorPicker.value = color;
    });
    elements.customColor.hidden = !isPro;
    elements.proColor.hidden = isPro;
    elements.colorPicker.disabled = !isPro;
    elements.colorPicker.setAttribute(
      "aria-label",
      isPro ? "Choose a custom Pro color" : "Custom colors require Pro",
    );
    elements.paletteTier.textContent = isPro
      ? "Pro palette + custom"
      : "Free palette";
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
      } catch {
        console.warn("Position link could not be copied.", url);
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
    elements.redeemSpecialCode?.addEventListener("click", async () => {
      const code = elements.specialCodeInput?.value?.trim();
      if (!code) {
        elements.specialCodeStatus.textContent = "Enter a special code first.";
        return;
      }
      try {
        await api.redeemSpecialCode(code);
        elements.specialCodeInput.value = "";
        elements.specialCodeStatus.textContent =
          "Special code applied. Check your cooldown above.";
        await refreshAccount();
      } catch (error) {
        elements.specialCodeStatus.textContent =
          error.message ?? "Special code could not be applied.";
      }
    });
  }

  function renderInvite(state) {
    const visible = Boolean(
      state.authenticated && state.communityStandardsAccepted && !state.isBanned,
    );
    elements.inviteBlock.hidden = !visible;
    if (state.referralCode) elements.inviteCode.textContent = state.referralCode;
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
    const request = ++billingRequest;
    if (!stripeEnabled || !accountState.snapshot.authenticated) {
      stripeHasCustomer = false;
      stripeTrialAvailable = false;
      stripeCurrentInterval = null;
      renderBilling(accountState.snapshot);
      return;
    }
    try {
      const status = await api.stripeStatus();
      if (request !== billingRequest || !accountState.snapshot.authenticated) return;
      stripeHasCustomer = status?.hasCustomer === true;
      stripeTrialAvailable = status?.trialAvailable === true;
      stripeCurrentInterval = status?.currentInterval ?? null;
    } catch {
      if (request !== billingRequest) return;
      stripeHasCustomer = false;
      stripeTrialAvailable = false;
      stripeCurrentInterval = null;
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
    elements.billingStatus.textContent = "Opening subscription settings…";
    setBillingDisabled(true);
    try {
      const session = await api.createStripePortalSession();
      if (session?.url) {
        window.location.assign(session.url);
        return;
      }
      elements.billingStatus.textContent = "Subscription settings could not be opened.";
    } catch (error) {
      elements.billingStatus.textContent =
        error.message ?? "Subscription settings could not be opened.";
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
      !state.isBanned
        && (
          (!state.authenticated && stripeEnabled)
          || (state.authenticated && (stripeEnabled || state.entitlementSource === "storekit"))
        ),
    );
    elements.billingSection.hidden = !visible;
    elements.billingBlock.hidden = !visible;
    if (!visible) return;
    const isPro = isProTier(state.tier);
    elements.billingCopy.textContent = subscriptionMessage({
      isPro,
      trialAvailable: stripeTrialAvailable,
      currentInterval: stripeCurrentInterval,
      entitlementSource: state.entitlementSource,
      authenticated: state.authenticated,
      communityStandardsAccepted: state.communityStandardsAccepted,
    });
    const canPurchase = canPurchaseStripe({
      stripeEnabled,
      authenticated: state.authenticated,
      communityStandardsAccepted: state.communityStandardsAccepted,
      isPro,
      entitlementSource: state.entitlementSource,
    });
    const stripeManaged = state.entitlementSource === "stripe";
    const appleManaged = state.entitlementSource === "storekit";
    elements.billingMonth.hidden = !canPurchase;
    elements.billingYear.hidden =
      !stripeManaged || !isPro || stripeCurrentInterval !== "month";
    elements.billingYear.textContent = isPro
      ? "Switch to annual · $24.99"
      : "Subscribe annual · $24.99";
    elements.billingPortal.hidden =
      !stripeHasCustomer || !stripeManaged;
    elements.billingApple.hidden = !appleManaged;
    elements.billingPolicy.hidden = !appleManaged;
    renderInvite(state);
  }
}

function collectElements(app) {
  return {
    canvas: app.querySelector("#board-canvas"),
    palette: app.querySelector("[data-palette]"),
    paletteTier: app.querySelector("[data-palette-tier]"),
    proColor: app.querySelector("[data-pro-color]"),
    colorPicker: app.querySelector("[data-color-picker]"),
    customColor: app.querySelector("[data-custom-color]"),
    coordinate: app.querySelector("[data-coordinate]"),
    zoom: app.querySelector("[data-zoom]"),
    placementHint: app.querySelector("[data-placement-hint]"),
    zoomIn: app.querySelector("[data-zoom-in]"),
    zoomOut: app.querySelector("[data-zoom-out]"),
    connection: app.querySelector("[data-connection]"),
    panel: app.querySelector("[data-account-panel]"),
    panelToggle: app.querySelector("[data-panel-toggle]"),
    panelClose: app.querySelector("[data-panel-close]"),
    panelScrim: app.querySelector("[data-panel-scrim]"),
    loginButtons: [...app.querySelectorAll("[data-login-provider]")],
    signOut: app.querySelector("[data-sign-out]"),
    deleteAccount: app.querySelector("[data-delete-account]"),
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
    locateOpen: app.querySelector("[data-locate-open]"),
    locateDialog: app.querySelector("[data-locate-dialog]"),
    locateClose: app.querySelector("[data-locate-close]"),
    locateForm: app.querySelector("[data-locate-form]"),
    locateOrigin: app.querySelector("[data-locate-origin]"),
    locateSelected: app.querySelector("[data-locate-selected]"),
    locateRow: app.querySelector("[data-locate-row]"),
    locateColumn: app.querySelector("[data-locate-column]"),
    locateStatus: app.querySelector("[data-locate-status]"),
    sharePosition: app.querySelector("[data-share-position]"),
    inviteBlock: app.querySelector("[data-invite-block]"),
    inviteCode: app.querySelector("[data-invite-code]"),
    copyInvite: app.querySelector("[data-copy-invite]"),
    inviteStatus: app.querySelector("[data-invite-status]"),
    specialCodeInput: app.querySelector("[data-special-code-input]"),
    redeemSpecialCode: app.querySelector("[data-redeem-special-code]"),
    specialCodeStatus: app.querySelector("[data-special-code-status]"),
    billingBlock: app.querySelector("[data-billing-block]"),
    billingSection: app.querySelector("[data-billing-section]"),
    billingMonth: app.querySelector("[data-billing-month]"),
    billingYear: app.querySelector("[data-billing-year]"),
    billingPortal: app.querySelector("[data-billing-portal]"),
    billingApple: app.querySelector("[data-billing-apple]"),
    billingPolicy: app.querySelector("[data-billing-policy]"),
    billingStatus: app.querySelector("[data-billing-status]"),
    billingCopy: app.querySelector("[data-billing-copy]"),
  };
}

function createPalette(container, colors, selectedColor, onSelect) {
  for (const color of colors) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "swatch";
    button.style.backgroundColor = color;
    button.setAttribute("role", "radio");
    button.setAttribute("aria-label", `${colorName(color)} (${color})`);
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
