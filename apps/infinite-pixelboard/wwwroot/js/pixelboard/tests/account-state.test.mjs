import assert from "node:assert/strict";
import test from "node:test";
import { AccountState } from "../account-state.mjs";

test("account state combines authentication, policy, and cooldown", () => {
  const now = Date.parse("2026-08-21T19:00:00Z");
  const state = new AccountState({ now: () => now, document: null });
  state.setAccount({
    tier: "Free",
    canPlace: true,
    communityStandardsAccepted: true,
    cooldown: {
      nextPlacementAt: "2026-08-21T19:00:02Z",
      cooldownSeconds: 10,
    },
  });

  assert.deepEqual(state.snapshot, {
    authenticated: true,
    tier: "Free",
    entitlementSource: null,
    canPlace: false,
    communityStandardsAccepted: true,
    remainingSeconds: 2,
    referralCode: null,
    paintBoost: null,
    allowedColors: null,
    isBanned: false,
  });
  state.dispose();
});

test("cooldown UI state reappears after visibilitychange when timers were dropped", () => {
  let now = Date.parse("2026-08-21T19:00:00Z");
  const timers = new Map();
  let nextId = 1;
  let hidden = true;
  const listeners = new Map();
  const doc = {
    get hidden() {
      return hidden;
    },
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    removeEventListener(type, handler) {
      if (listeners.get(type) === handler) listeners.delete(type);
    },
  };
  const remaining = [];
  const state = new AccountState({
    now: () => now,
    onChange: (snapshot) => remaining.push(snapshot.remainingSeconds),
    document: doc,
    setTimeout: (callback) => {
      const id = nextId++;
      timers.set(id, callback);
      return id;
    },
    clearTimeout: (id) => {
      timers.delete(id);
    },
  });

  state.setCooldown({
    nextPlacementAt: "2026-08-21T19:00:05Z",
    cooldownSeconds: 5,
  });
  assert.equal(remaining.at(-1), 5);
  assert.equal(timers.size, 1);

  // Simulate a background tab dropping the throttled timeout chain.
  timers.clear();
  now = Date.parse("2026-08-21T19:00:02Z");

  hidden = false;
  listeners.get("visibilitychange")();

  assert.equal(remaining.at(-1), 3);
  assert.equal(timers.size, 1);

  now = Date.parse("2026-08-21T19:00:04Z");
  [...timers.values()][0]();
  assert.equal(remaining.at(-1), 1);

  state.dispose();
  assert.equal(listeners.size, 0);
});
