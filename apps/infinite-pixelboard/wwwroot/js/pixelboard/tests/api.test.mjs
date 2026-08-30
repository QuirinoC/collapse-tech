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

test("advertising policy is fetched for anonymous sessions", async (context) => {
  let request;
  context.mock.method(globalThis, "fetch", async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ showAd: false, placement: "board" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  const api = new PixelboardApi();

  const decision = await api.advertising();

  assert.equal(request.url, "/api/v1/advertising");
  assert.equal("Authorization" in request.options.headers, false);
  assert.equal(decision.showAd, false);
});

test("reports send only bounded coordinates, reason, note, and client context", async (context) => {
  let request;
  context.mock.method(globalThis, "fetch", async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({
      reportId: { value: "report-1" },
      status: 0,
      submittedAt: "2026-08-21T00:00:00Z",
    }), { status: 201, headers: { "content-type": "application/json" } });
  });
  const api = new PixelboardApi({ getToken: async () => "firebase-token" });

  await api.report({
    region: { top: -7, left: 9, width: 8, height: 8 },
    reason: 0,
    note: "Current area",
  });

  const body = JSON.parse(request.options.body);
  assert.equal(request.url, "/api/v1/reports");
  assert.equal(request.options.method, "POST");
  assert.deepEqual(body.region, { top: -7, left: 9, width: 8, height: 8 });
  assert.equal(body.reason, 0);
  assert.equal(body.client.platform, "web");
  assert.equal("screenshot" in body, false);
  assert.equal("accountId" in body, false);
});

test("account deletion uses the authenticated server route", async (context) => {
  let request;
  context.mock.method(globalThis, "fetch", async (url, options) => {
    request = { url, options };
    return new Response(null, { status: 204 });
  });
  const api = new PixelboardApi({ getToken: async () => "firebase-token" });

  await api.deleteAccount();

  assert.equal(request.url, "/api/v1/account");
  assert.equal(request.options.method, "DELETE");
  assert.equal(request.options.headers.Authorization, "Bearer firebase-token");
});

test("invite claims post the normalized code to the account referral route", async (context) => {
  let request;
  context.mock.method(globalThis, "fetch", async (url, options) => {
    request = { url, options };
    return new Response(null, { status: 204 });
  });
  const api = new PixelboardApi({ getToken: async () => "firebase-token" });

  await api.claimReferral("ABCD2345");

  assert.equal(request.url, "/api/v1/account/referral");
  assert.equal(request.options.method, "POST");
  assert.equal(JSON.parse(request.options.body).code, "ABCD2345");
});

test("stripe checkout posts month or year and never a card payload", async (context) => {
  let request;
  context.mock.method(globalThis, "fetch", async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ url: "https://checkout.stripe.test/session" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  const api = new PixelboardApi({ getToken: async () => "firebase-token" });

  await api.createStripeCheckoutSession("month");

  assert.equal(request.url, "/api/v1/stripe/checkout-session");
  assert.equal(request.options.method, "POST");
  assert.deepEqual(JSON.parse(request.options.body), { interval: "month" });
  assert.equal("card" in JSON.parse(request.options.body), false);
});

test("stripe config is public and portal requires a session token", async (context) => {
  const requests = [];
  context.mock.method(globalThis, "fetch", async (url, options) => {
    requests.push({ url, options });
    return new Response(JSON.stringify({ enabled: true, url: "https://billing.stripe.test" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  const api = new PixelboardApi({ getToken: async () => "firebase-token" });

  await api.stripeConfig();
  await api.createStripePortalSession();

  assert.equal(requests[0].url, "/api/v1/stripe/config");
  assert.equal("Authorization" in requests[0].options.headers, false);
  assert.equal(requests[1].url, "/api/v1/stripe/portal");
  assert.equal(requests[1].options.headers.Authorization, "Bearer firebase-token");
});
