import { createFirebaseAuthClient } from "./pixelboard/firebase-auth.mjs";

const elements = {
  status: document.querySelector("#status"),
  refresh: document.querySelector("#refresh"),
  signIn: document.querySelector("#moderator-sign-in"),
  signOut: document.querySelector("#moderator-sign-out"),
  list: document.querySelector("#report-list"),
  empty: document.querySelector("#empty-review"),
  review: document.querySelector("#report-review"),
  metadata: document.querySelector("#report-metadata"),
  canvas: document.querySelector("#evidence-canvas"),
  rawEvidence: document.querySelector("#raw-evidence"),
  reason: document.querySelector("#action-reason"),
  target: document.querySelector("#target-account"),
  expiry: document.querySelector("#suspension-expiry"),
  placementsFrozen: document.querySelector("#placements-frozen"),
  adsDisabled: document.querySelector("#ads-disabled"),
  safetyReason: document.querySelector("#safety-reason"),
  saveSafety: document.querySelector("#save-safety"),
};

let selectedReport = null;
let authorizationGeneration = 0;
const authReady = initializeAuthentication();

function setStatus(message, error = false) {
  elements.status.textContent = message;
  elements.status.dataset.error = String(error);
}

async function token() {
  const provider = await authReady;
  if (!provider?.getToken) {
    throw new Error("Moderator authentication is not configured in this browser.");
  }

  const value = await provider.getToken();
  if (!value) throw new Error("Sign in with a moderator account to continue.");
  return value;
}

async function initializeAuthentication() {
  try {
    const client = await createFirebaseAuthClient();
    window.CollapsePixelboardAuth = client;
    await new Promise((resolve) => {
      let initialized = false;
      client.subscribe((user) => {
        authorizationGeneration += 1;
        clearPrivateState();
        elements.signIn.hidden = Boolean(user);
        elements.signOut.hidden = !user;
        if (!initialized) {
          initialized = true;
          resolve();
        } else {
          load();
        }

        function clearPrivateState() {
          selectedReport = null;
          elements.list.replaceChildren();
          elements.empty.hidden = false;
          elements.review.hidden = true;
          elements.metadata.replaceChildren();
          elements.rawEvidence.textContent = "";
          elements.target.value = "";
          elements.reason.value = "";
          elements.expiry.value = "";
          elements.placementsFrozen.checked = false;
          elements.adsDisabled.checked = false;
          elements.safetyReason.value = "";
          const context = elements.canvas.getContext("2d");
          context.clearRect(0, 0, elements.canvas.width, elements.canvas.height);
        }
      });
    });
    return client;
  } catch (error) {
    console.error("Moderator authentication failed to initialize.", error);
    return null;
  }
}

async function request(path, options = {}) {
  const bearer = await token();
  const response = await fetch(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${bearer}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.message ?? `Moderator request failed (${response.status}).`);
  }
  return body;
}

function appendMetadata(label, value) {
  const term = document.createElement("dt");
  term.textContent = label;
  const description = document.createElement("dd");
  description.textContent = value ?? "—";
  elements.metadata.append(term, description);
}

function evidencePlacements(report) {
  return report.snapshot?.recentAttributedPlacements ?? [];
}

function renderEvidence(report) {
  const colors = report.snapshot?.colors;
  const context = elements.canvas.getContext("2d");
  context.imageSmoothingEnabled = false;
  context.fillStyle = "#fff";
  context.fillRect(0, 0, elements.canvas.width, elements.canvas.height);
  if (!Array.isArray(colors) || colors.length === 0) return;

  const rows = colors.length;
  const columns = Math.max(...colors.map((row) => row.length));
  const size = Math.max(rows, columns);
  const scale = elements.canvas.width / size;
  colors.forEach((row, rowIndex) => row.forEach((color, columnIndex) => {
    context.fillStyle = color;
    context.fillRect(columnIndex * scale, rowIndex * scale, Math.ceil(scale), Math.ceil(scale));
  }));
}

function selectReport(report) {
  selectedReport = report;
  elements.empty.hidden = true;
  elements.review.hidden = false;
  elements.metadata.replaceChildren();
  appendMetadata("Report", report.reportId);
  appendMetadata("Status", report.status);
  appendMetadata("Reason", report.reason);
  appendMetadata("Region", `${report.region.top}, ${report.region.left} · ${report.region.width}×${report.region.height}`);
  appendMetadata("Submitted", new Date(report.submittedAt).toLocaleString());
  appendMetadata("Evidence hash", report.evidenceHash);
  appendMetadata("Reporter note", report.note);
  elements.rawEvidence.textContent = JSON.stringify(report.snapshot, null, 2);
  const firstAccount = evidencePlacements(report).find((placement) => placement.firebaseUid)?.firebaseUid;
  elements.target.value = firstAccount ?? "";
  renderEvidence(report);
  document.querySelectorAll("#report-list button").forEach((button) => {
    button.setAttribute("aria-current", String(button.dataset.reportId === report.reportId));
  });
}

function renderQueue(reports) {
  elements.list.replaceChildren();
  reports.forEach((report) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    const title = document.createElement("span");
    const detail = document.createElement("span");
    button.type = "button";
    button.dataset.reportId = report.reportId;
    title.className = "report-title";
    title.textContent = `${report.reason} · ${report.status}`;
    detail.className = "report-detail";
    detail.textContent = `${new Date(report.submittedAt).toLocaleString()} / ${report.reportId}`;
    button.append(title, detail);
    button.addEventListener("click", () => selectReport(report));
    item.append(button);
    elements.list.append(item);
  });
  if (reports.length === 0) {
    const item = document.createElement("li");
    item.className = "empty";
    item.textContent = "No reports are waiting.";
    elements.list.append(item);
  }
}

async function load() {
  const generation = authorizationGeneration;
  setStatus("Loading private moderation queue...");
  try {
    const [reports, safety] = await Promise.all([
      request("/api/v1/moderation/reports?limit=100"),
      request("/api/v1/moderation/safety"),
    ]);
    if (generation !== authorizationGeneration) return;
    renderQueue(reports);
    elements.placementsFrozen.checked = safety.placementsFrozen;
    elements.adsDisabled.checked = safety.adsDisabled;
    setStatus(`${reports.length} report${reports.length === 1 ? "" : "s"} loaded.`);
  } catch (error) {
    setStatus(error.message, true);
  }
}

function idempotencyKey(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

async function executeAction(actionType) {
  if (!selectedReport) return;
  const reason = elements.reason.value.trim();
  if (!reason) {
    setStatus("A moderator reason is required.", true);
    elements.reason.focus();
    return;
  }

  const placements = evidencePlacements(selectedReport);
  const requestBody = {
    actionType,
    reason,
    idempotencyKey: idempotencyKey(actionType),
    reportId: selectedReport.reportId,
    targetAccountId: elements.target.value.trim() || null,
    placementIds: actionType === "rollback"
      ? placements.map((placement) => placement.placementId).filter(Boolean)
      : [],
    expiresAt: actionType === "suspend" && elements.expiry.value
      ? new Date(elements.expiry.value).toISOString()
      : null,
  };

  setStatus(`Applying ${actionType}...`);
  try {
    await request("/api/v1/moderation/actions", {
      method: "POST",
      body: JSON.stringify(requestBody),
    });
    setStatus(`${actionType} completed and audited.`);
    await load();
  } catch (error) {
    setStatus(error.message, true);
  }
}

elements.refresh.addEventListener("click", load);
elements.signIn.addEventListener("click", async () => {
  setStatus("Opening secure moderator sign-in...");
  try {
    const client = await authReady;
    if (!client) throw new Error("Moderator authentication is unavailable.");
    await client.signIn("google");
  } catch (error) {
    setStatus(error.message, true);
  }
});
elements.signOut.addEventListener("click", async () => {
  try {
    const client = await authReady;
    await client?.signOut();
  } catch (error) {
    setStatus(error.message, true);
  }
});
elements.saveSafety.addEventListener("click", async () => {
  const reason = elements.safetyReason.value.trim();
  if (!reason) {
    setStatus("A safety-state reason is required.", true);
    return;
  }
  try {
    await request("/api/v1/moderation/safety", {
      method: "POST",
      body: JSON.stringify({
        placementsFrozen: elements.placementsFrozen.checked,
        adsDisabled: elements.adsDisabled.checked,
        reason,
        idempotencyKey: idempotencyKey("safety"),
      }),
    });
    setStatus("Platform safety state updated and audited.");
  } catch (error) {
    setStatus(error.message, true);
  }
});
document.querySelectorAll("[data-action]").forEach((button) => {
  button.addEventListener("click", () => executeAction(button.dataset.action));
});

load();
