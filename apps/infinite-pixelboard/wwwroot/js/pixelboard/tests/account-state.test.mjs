import assert from "node:assert/strict";
import test from "node:test";
import { AccountState } from "../account-state.mjs";

test("account state combines authentication, policy, and cooldown", () => {
  const now = Date.parse("2026-08-21T19:00:00Z");
  const state = new AccountState({ now: () => now });
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
    canPlace: false,
    communityStandardsAccepted: true,
    remainingSeconds: 2,
  });
  state.dispose();
});
