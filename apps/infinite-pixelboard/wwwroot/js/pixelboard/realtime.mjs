const RECORD_SEPARATOR = "\u001e";
const RECONNECT_DELAYS = [0, 1_000, 3_000, 5_000, 10_000];

export class PixelboardRealtimeClient {
  constructor({
    endpoint = "/api/v1/realtime",
    fetchImpl = globalThis.fetch?.bind(globalThis),
    webSocketFactory = (url) => new WebSocket(url),
    location = globalThis.location,
    setTimer = globalThis.setTimeout?.bind(globalThis),
    clearTimer = globalThis.clearTimeout?.bind(globalThis),
    onAcceptedPixel,
    onConnected,
    onState,
  } = {}) {
    this.endpoint = endpoint;
    this.fetch = fetchImpl;
    this.webSocketFactory = webSocketFactory;
    this.location = location;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.onAcceptedPixel = onAcceptedPixel ?? (() => {});
    this.onConnected = onConnected ?? (() => {});
    this.onState = onState ?? (() => {});
    this.attempt = 0;
    this.lastCursor = null;
    this.socket = null;
    this.reconnectTimer = null;
    this.handshakeTimer = null;
    this.pingTimer = null;
    this.abortController = null;
    this.stopped = true;
  }

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.#connect();
  }

  stop() {
    this.stopped = true;
    this.abortController?.abort();
    this.abortController = null;
    this.#clearConnectionTimers();
    if (this.reconnectTimer !== null) this.clearTimer?.(this.reconnectTimer);
    this.reconnectTimer = null;
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    this.onState("offline");
  }

  async #connect() {
    if (this.stopped) return;
    this.onState(this.attempt ? "degraded" : "connecting");
    this.abortController = new AbortController();

    try {
      const negotiation = await negotiate(
        this.fetch,
        this.endpoint,
        this.abortController.signal);
      if (this.stopped) return;

      const socket = this.webSocketFactory(
        websocketUrl(this.location, this.endpoint, negotiation));
      this.socket = socket;
      let handshakePending = true;
      this.handshakeTimer = this.setTimer(() => socket.close(), 10_000);

      socket.addEventListener("open", () => {
        socket.send(`{"protocol":"json","version":1}${RECORD_SEPARATOR}`);
      });
      socket.addEventListener("message", (event) => {
        if (this.socket !== socket || typeof event.data !== "string") return;
        try {
          for (const record of event.data.split(RECORD_SEPARATOR)) {
            if (!record) continue;
            const message = JSON.parse(record);
            if (handshakePending) {
              handshakePending = false;
              if (message.error) {
                socket.close();
                return;
              }
              if (this.handshakeTimer !== null) this.clearTimer(this.handshakeTimer);
              this.handshakeTimer = null;
              this.attempt = 0;
              this.onState("online");
              this.onConnected();
              this.#schedulePing(socket);
              continue;
            }

            if (isAcceptedPixelInvocation(message)) {
              const envelope = message.arguments[0];
              const cursorOrder = compareCursors(envelope.cursor, this.lastCursor);
              if (cursorOrder > 0) {
                this.lastCursor = envelope.cursor;
                this.onAcceptedPixel(envelope);
              } else if (cursorOrder < 0) {
                this.onConnected();
              }
            }
          }
        } catch {
          socket.close();
        }
      });
      socket.addEventListener("close", () => {
        if (this.socket !== socket) return;
        this.socket = null;
        this.#clearConnectionTimers();
        this.#scheduleReconnect();
      });
      socket.addEventListener("error", () => socket.close());
    } catch (error) {
      if (error?.name !== "AbortError") this.#scheduleReconnect();
    }
  }

  #scheduleReconnect() {
    if (this.stopped || this.reconnectTimer !== null) return;
    this.onState("degraded");
    const delay = RECONNECT_DELAYS[
      Math.min(this.attempt, RECONNECT_DELAYS.length - 1)
    ];
    this.attempt += 1;
    this.reconnectTimer = this.setTimer(() => {
      this.reconnectTimer = null;
      this.#connect();
    }, delay);
  }

  #schedulePing(socket) {
    this.pingTimer = this.setTimer(() => {
      if (this.socket !== socket) return;
      socket.send(`{"type":6}${RECORD_SEPARATOR}`);
      this.#schedulePing(socket);
    }, 10_000);
  }

  #clearConnectionTimers() {
    if (this.handshakeTimer !== null) this.clearTimer?.(this.handshakeTimer);
    if (this.pingTimer !== null) this.clearTimer?.(this.pingTimer);
    this.handshakeTimer = null;
    this.pingTimer = null;
  }
}

async function negotiate(fetchImpl, endpoint, signal) {
  if (!fetchImpl) throw new Error("Fetch is unavailable.");
  const response = await fetchImpl(
    `${endpoint}/negotiate?negotiateVersion=1`,
    { method: "POST", signal });
  if (!response.ok) {
    throw new Error(`Real-time negotiation failed with HTTP ${response.status}.`);
  }
  const negotiation = await response.json();
  if (!negotiation.connectionToken) {
    throw new Error("Real-time negotiation returned no connection token.");
  }
  return negotiation;
}

function websocketUrl(location, endpoint, negotiation) {
  const url = new URL(negotiation.url ?? endpoint, location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("id", negotiation.connectionToken);
  if (negotiation.accessToken) {
    url.searchParams.set("access_token", negotiation.accessToken);
  }
  return url.toString();
}

function isAcceptedPixelInvocation(message) {
  if (message?.type !== 1
    || message.target !== "AcceptedPixelV1"
    || !Array.isArray(message.arguments)
    || message.arguments.length !== 1) {
    return false;
  }

  const envelope = message.arguments[0];
  const pixel = envelope?.data?.pixel;
  return envelope?.protocolVersion === 1
    && envelope.type === "pixel.accepted"
    && /^\d+-\d+$/.test(envelope.cursor)
    && typeof envelope.data.placementId === "string"
    && Number.isInteger(pixel?.row)
    && Number.isInteger(pixel?.column)
    && typeof pixel?.color === "string"
    && typeof pixel?.placedAt === "string";
}

export function isNewerCursor(candidate, current) {
  return compareCursors(candidate, current) > 0;
}

function compareCursors(candidate, current) {
  if (current === null) return 1;
  const [candidateTime, candidateSequence] = candidate.split("-").map(BigInt);
  const [currentTime, currentSequence] = current.split("-").map(BigInt);
  if (candidateTime !== currentTime) return candidateTime > currentTime ? 1 : -1;
  if (candidateSequence === currentSequence) return 0;
  return candidateSequence > currentSequence ? 1 : -1;
}
