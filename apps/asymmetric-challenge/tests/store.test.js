import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchTotals,
  insertTelemetry,
  setD1Binding,
  tryClaim,
} from "../src/lib/server/store.js";

const secretHex = "a1".repeat(32);
process.env.SECRET_KEY_HEX = secretHex;

function createMemoryD1() {
  const state = {
    totals: { attempts_total: 0, attempts_auto: 0, attempts_manual: 0 },
    winner: null,
  };

  function exec(sql, params) {
    const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
    if (normalized.includes("from telemetry_totals")) {
      return {
        success: true,
        results: [{ ...state.totals }],
      };
    }
    if (normalized.includes("insert into telemetry_totals")) {
      state.totals.attempts_total += Number(params[0]);
      state.totals.attempts_auto += Number(params[1]);
      state.totals.attempts_manual += Number(params[2]);
      return { success: true, results: [] };
    }
    if (normalized.includes("insert into winners")) {
      if (state.winner) {
        const error = new Error("UNIQUE constraint failed: winners.winner_slot");
        error.code = "SQLITE_CONSTRAINT";
        throw error;
      }
      state.winner = { id: params[0], claim_token: params[1] };
      return { success: true, results: [] };
    }
    throw new Error(`unexpected sql: ${sql}`);
  }

  return {
    prepare(sql) {
      return {
        bind(...params) {
          return {
            all: async () => exec(sql, params),
            run: async () => exec(sql, params),
          };
        },
      };
    },
  };
}

test("fetchTotals and insertTelemetry accumulate a singleton counter", async () => {
  setD1Binding(createMemoryD1());
  try {
    assert.deepEqual(await fetchTotals(), { total: 0, auto: 0, manual: 0 });
    await insertTelemetry({ attemptsTotal: 10, attemptsAuto: 7, attemptsManual: 3 });
    await insertTelemetry({ attemptsTotal: 2, attemptsAuto: 0, attemptsManual: 2 });
    assert.deepEqual(await fetchTotals(), { total: 12, auto: 7, manual: 5 });
  } finally {
    setD1Binding(null);
  }
});

test("tryClaim awards the first correct guess and rejects a second winner", async () => {
  setD1Binding(createMemoryD1());
  try {
    const miss = await tryClaim({ guessHex: "b2".repeat(32) });
    assert.deepEqual(miss, { status: "nope" });

    const win = await tryClaim({ guessHex: secretHex });
    assert.equal(win.status, "won");
    assert.match(win.claimToken, /^[0-9a-f]{32}$/);

    const replay = await tryClaim({ guessHex: secretHex });
    assert.deepEqual(replay, { status: "already_won" });
  } finally {
    setD1Binding(null);
  }
});
