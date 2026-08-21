import assert from "node:assert/strict";
import test from "node:test";
import { PlacementReconciler } from "../reconciliation.mjs";

test("rejected optimistic placements restore the prior pixel", async () => {
  const changes = [];
  const cache = {
    color: "#FFFFFF",
    version: 0,
    applyPixel(_row, _column, color) {
      const previous = { color: this.color, version: this.version };
      this.color = color;
      this.version += 1;
      return { previous, version: this.version };
    },
    restorePixel(_row, _column, color, expectedVersion) {
      if (this.version !== expectedVersion) return false;
      this.color = color;
      this.version += 1;
      return true;
    },
  };
  const reconciler = new PlacementReconciler({
    cache,
    place: async () => { throw new Error("cooldown"); },
    onChange: (change) => changes.push(change.state),
  });

  await assert.rejects(reconciler.submit({ row: 1, column: 2, color: "#D3523C" }));

  assert.equal(cache.color, "#FFFFFF");
  assert.deepEqual(changes, ["pending", "rejected"]);
});

test("accepted server pixels replace optimistic color with canonical state", async () => {
  const cache = {
    color: "#FFFFFF",
    version: 0,
    applyPixel(_row, _column, color) {
      const previous = { color: this.color, version: this.version };
      this.color = color;
      this.version += 1;
      return { previous, version: this.version };
    },
    restorePixel() {
      throw new Error("restore should not run");
    },
  };
  const reconciler = new PlacementReconciler({
    cache,
    place: async () => ({
      pixel: { row: 1, column: 2, color: "#D3523C" },
      cooldown: { cooldownSeconds: 10, nextPlacementAt: null },
    }),
  });

  await reconciler.submit({ row: 1, column: 2, color: "#d3523c" });

  assert.equal(cache.color, "#D3523C");
});
