import assert from "node:assert/strict";
import test from "node:test";
import { PixelboardRealtimeClient } from "../realtime.mjs";

test("negotiates SignalR v1 and emits accepted pixel envelopes after handshake", async () => {
  const socket = new FakeSocket();
  const states = [];
  const accepted = [];
  let connected = 0;
  const client = new PixelboardRealtimeClient({
    fetchImpl: async (url, options) => {
      assert.equal(url, "/api/v1/realtime/negotiate?negotiateVersion=1");
      assert.equal(options.method, "POST");
      return response({ connectionToken: "connection-token" });
    },
    webSocketFactory: (url) => {
      assert.equal(
        url,
        "wss://pixelboard.test/api/v1/realtime?id=connection-token");
      return socket;
    },
    location: { href: "https://pixelboard.test/board" },
    onState: (state) => states.push(state),
    onConnected: () => { connected += 1; },
    onAcceptedPixel: (event) => accepted.push(event),
  });

  client.start();
  await nextTurn();
  socket.emit("open");
  assert.equal(
    socket.sent[0],
    "{\"protocol\":\"json\",\"version\":1}\u001e");
  socket.emit("message", { data: "{}\u001e" });
  socket.emit("message", {
    data: `${JSON.stringify({
      type: 1,
      target: "AcceptedPixelV1",
      arguments: [{
        protocolVersion: 1,
        type: "pixel.accepted",
        cursor: "1730000000000-0",
        data: {
          placementId: "placement",
          pixel: {
            row: -1,
            column: 128,
            color: "#ABCDEF",
            placedAt: "2026-08-21T00:00:00+00:00",
          },
        },
      }],
    })}\u001e`,
  });

  assert.deepEqual(states, ["connecting", "online"]);
  assert.equal(connected, 1);
  assert.equal(accepted[0].cursor, "1730000000000-0");
  assert.equal(accepted[0].data.pixel.row, -1);
  client.stop();
});

test("reconnects after closure and runs catch-up after each handshake", async () => {
  const sockets = [new FakeSocket(), new FakeSocket()];
  const timers = [];
  let connections = 0;
  let catchUps = 0;
  const client = new PixelboardRealtimeClient({
    fetchImpl: async () => response({ connectionToken: `token-${connections}` }),
    webSocketFactory: () => sockets[connections++],
    location: { href: "http://pixelboard.test/board" },
    setTimer: (callback, delay) => {
      timers.push({ callback, delay });
      return timers.length;
    },
    clearTimer: () => {},
    onConnected: () => { catchUps += 1; },
  });

  client.start();
  await nextTurn();
  sockets[0].emit("open");
  sockets[0].emit("message", { data: "{}\u001e" });
  sockets[0].emit("close");

  const reconnect = timers.find((timer) => timer.delay === 0);
  assert.ok(reconnect);
  reconnect.callback();
  await nextTurn();
  sockets[1].emit("open");
  sockets[1].emit("message", { data: "{}\u001e" });

  assert.equal(connections, 2);
  assert.equal(catchUps, 2);
  client.stop();
});

test("discards duplicate and out-of-order Redis stream cursors", async () => {
  const socket = new FakeSocket();
  const accepted = [];
  let reconciliations = 0;
  const client = new PixelboardRealtimeClient({
    fetchImpl: async () => response({ connectionToken: "token" }),
    webSocketFactory: () => socket,
    location: { href: "https://pixelboard.test/board" },
    onAcceptedPixel: (event) => accepted.push(event.cursor),
    onConnected: () => { reconciliations += 1; },
  });
  client.start();
  await nextTurn();
  socket.emit("open");
  socket.emit("message", { data: "{}\u001e" });

  for (const cursor of ["100-1", "100-0", "100-1", "101-0"]) {
    socket.emit("message", { data: invocation(cursor) });
  }

  assert.deepEqual(accepted, ["100-1", "101-0"]);
  assert.equal(reconciliations, 2);
  client.stop();
});

test("sends SignalR keepalive pings after the handshake", async () => {
  const socket = new FakeSocket();
  const timers = [];
  const client = new PixelboardRealtimeClient({
    fetchImpl: async () => response({ connectionToken: "token" }),
    webSocketFactory: () => socket,
    location: { href: "https://pixelboard.test/board" },
    setTimer: (callback, delay) => {
      const timer = { callback, delay, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimer: (timer) => { timer.cleared = true; },
  });
  client.start();
  await nextTurn();
  socket.emit("open");
  socket.emit("message", { data: "{}\u001e" });

  const ping = timers.find((timer) => timer.delay === 10_000 && !timer.cleared);
  assert.ok(ping);
  ping.callback();

  assert.equal(socket.sent.at(-1), "{\"type\":6}\u001e");
  client.stop();
});

test("closes a connection that never completes the SignalR handshake", async () => {
  const socket = new FakeSocket();
  const timers = [];
  const client = new PixelboardRealtimeClient({
    fetchImpl: async () => response({ connectionToken: "token" }),
    webSocketFactory: () => socket,
    location: { href: "https://pixelboard.test/board" },
    setTimer: (callback, delay) => {
      timers.push({ callback, delay });
      return timers.length;
    },
    clearTimer: () => {},
  });
  client.start();
  await nextTurn();

  const handshakeTimeout = timers.find((timer) => timer.delay === 10_000);
  assert.ok(handshakeTimeout);
  handshakeTimeout.callback();

  assert.equal(socket.closed, true);
  assert.ok(timers.some((timer) => timer.delay === 0));
  client.stop();
});

function response(body) {
  return {
    ok: true,
    json: async () => body,
  };
}

function nextTurn() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function invocation(cursor) {
  return `${JSON.stringify({
    type: 1,
    target: "AcceptedPixelV1",
    arguments: [{
      protocolVersion: 1,
      type: "pixel.accepted",
      cursor,
      data: {
        placementId: "placement",
        pixel: {
          row: 1,
          column: 2,
          color: "#ABCDEF",
          placedAt: "2026-08-21T00:00:00+00:00",
        },
      },
    }],
  })}\u001e`;
}

class FakeSocket {
  constructor() {
    this.listeners = new Map();
    this.sent = [];
    this.closed = false;
  }

  addEventListener(name, callback) {
    this.listeners.set(name, callback);
  }

  emit(name, event = {}) {
    this.listeners.get(name)?.(event);
  }

  send(message) {
    this.sent.push(message);
  }

  close() {
    this.closed = true;
    this.emit("close");
  }
}
