import assert from "node:assert/strict";
import test from "node:test";
import { ApiError, PixelboardApi } from "../api.mjs";

test("placements use the authenticated v1 POST contract and never SendPixel", async (context) => {
  let request;
  context.mock.method(globalThis, "fetch", async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({
      outcome: "accepted",
      pixel: { row: 7, column: -2, color: "#D3523C" },
      cooldown: { nextPlacementAt: null, cooldownSeconds: 10 },
    }), { status: 200, headers: { "content-type": "application/json" } });
  });
  const api = new PixelboardApi({ getToken: async () => "firebase-token" });

  await api.place({
    row: 7,
    column: -2,
    color: "#d3523c",
    idempotencyKey: "request-1",
  });

  assert.equal(request.url, "/api/v1/placements");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers.Authorization, "Bearer firebase-token");
  assert.equal(JSON.parse(request.options.body).client.platform, "web");
  assert.doesNotMatch(`${request.url}${request.options.body}`, /SendPixel/i);
});

test("anonymous placement is rejected before any network request", async (context) => {
  const fetchMock = context.mock.method(globalThis, "fetch", async () => {
    throw new Error("fetch should not run");
  });
  const api = new PixelboardApi();

  await assert.rejects(
    api.place({ row: 0, column: 0, color: "#000000", idempotencyKey: "request-2" }),
    (error) => error instanceof ApiError && error.code === "authentication_required",
  );
  assert.equal(fetchMock.mock.callCount(), 0);
});
