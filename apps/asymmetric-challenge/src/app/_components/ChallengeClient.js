"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { bytesToHex, isHexString, normalizeHex } from "@/lib/shared/hex";
import { sha256Hex } from "@/lib/shared/hash";

const BATCH_MS = 10_000;
const BATCH_ATTEMPTS = 25_000;
const AUTO_WORKER_BATCH = 1_200;
const AUTO_WORKER_JITTER = 700;

export default function ChallengeClient({ commitmentHash, challengeId }) {
  const commitment = commitmentHash.toLowerCase();
  const [guessInput, setGuessInput] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [claimToken, setClaimToken] = useState("");
  const [challengeEnded, setChallengeEnded] = useState(false);
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [totals, setTotals] = useState({ total: 0, manual: 0, auto: 0 });
  const [globalTotals, setGlobalTotals] = useState(null);
  const [recentGuesses, setRecentGuesses] = useState([]);

  const totalsRef = useRef({ total: 0, manual: 0, auto: 0 });
  const batchRef = useRef({
    startAt: null,
    total: 0,
    manual: 0,
    auto: 0,
    lastSentAt: 0,
  });
  const workerRef = useRef(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      try {
        setGuessInput((current) => current || generateRandomHex());
      } catch (err) {
        setError("Secure random generation is unavailable in this browser.");
      }
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    let active = true;
    const fetchStats = async () => {
      try {
        const response = await fetch("/api/stats");
        if (!response.ok) return;
        const data = await response.json();
        if (active && data && data.totals) {
          setGlobalTotals(data.totals);
        }
      } catch (err) {
        // ignore failures
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 15000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const pushRecentGuess = useCallback((guessHex) => {
    if (!guessHex) return;
    const normalized = normalizeHex(guessHex);
    if (!isHexString(normalized, 64)) return;
    setRecentGuesses((prev) => {
      const next = [normalized, ...prev.filter((item) => item !== normalized)];
      return next.slice(0, 5);
    });
  }, []);

  const buildTelemetryPayload = useCallback(() => {
    if (!batchRef.current.startAt || batchRef.current.total === 0) {
      return null;
    }

    return {
      attemptsTotal: batchRef.current.total,
      attemptsAuto: batchRef.current.auto,
      attemptsManual: batchRef.current.manual,
    };
  }, []);

  const flushTelemetry = useCallback(
    (useBeacon) => {
      const endedAt = Date.now();
      const payload = buildTelemetryPayload();
      if (!payload) return;

      batchRef.current = {
        startAt: null,
        total: 0,
        manual: 0,
        auto: 0,
        lastSentAt: endedAt,
      };

      const body = JSON.stringify(payload);
      if (useBeacon && navigator.sendBeacon) {
        const blob = new Blob([body], { type: "application/json" });
        navigator.sendBeacon("/api/telemetry", blob);
        return;
      }

      fetch("/api/telemetry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => null);
    },
    [buildTelemetryPayload]
  );

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        flushTelemetry(true);
      }
    };
    const handleUnload = () => flushTelemetry(true);
    window.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("beforeunload", handleUnload);
    return () => {
      window.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("beforeunload", handleUnload);
    };
  }, [flushTelemetry]);

  const recordAttempts = useCallback(
    ({ auto = 0, manual = 0 }) => {
      const total = auto + manual;
      if (total <= 0) return;

      totalsRef.current.total += total;
      totalsRef.current.auto += auto;
      totalsRef.current.manual += manual;

      batchRef.current.total += total;
      batchRef.current.auto += auto;
      batchRef.current.manual += manual;

      const now = Date.now();
      if (!batchRef.current.startAt) {
        batchRef.current.startAt = now;
        batchRef.current.lastSentAt = now;
      }

      setTotals({ ...totalsRef.current });

      const timeElapsed = now - batchRef.current.lastSentAt;
      if (batchRef.current.total >= BATCH_ATTEMPTS || timeElapsed >= BATCH_MS) {
        flushTelemetry(false);
      }
    },
    [flushTelemetry]
  );

  const handleClaim = useCallback(
    async (guessHex) => {
      setError("");
      setStatus("");

      try {
        const response = await fetch("/api/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ guessHex }),
        });

        if (!response.ok) {
          setError("Claim failed. Try again later.");
          return;
        }

        const data = await response.json();
        if (data.status === "already_won") {
          setChallengeEnded(true);
          setAutoEnabled(false);
          setStatus("Challenge ended. Someone already claimed the prize.");
          return;
        }

        if (data.status === "nope") {
          setStatus("Nope. Not the key.");
          return;
        }

        if (data.status === "won") {
          setClaimToken(data.claimToken);
          setStatus("You got it. Claim token generated.");
          setChallengeEnded(true);
          setAutoEnabled(false);
          return;
        }

        setError("Unexpected response.");
      } catch (err) {
        setError("Claim failed. Try again later.");
      }
    },
    []
  );

  useEffect(() => {
    if (!autoEnabled) {
      if (workerRef.current) {
        workerRef.current.postMessage({ type: "stop" });
        workerRef.current.terminate();
        workerRef.current = null;
      }
      return;
    }

    const worker = new Worker("/guess-worker.js");
    workerRef.current = worker;

    worker.onmessage = (event) => {
      const { type, attempts, guessHex, sampleGuess } = event.data || {};
      if (type === "progress" && attempts) {
        recordAttempts({ auto: attempts, manual: 0 });
        if (sampleGuess) {
          pushRecentGuess(sampleGuess);
        }
      }
      if (type === "win" && guessHex) {
        recordAttempts({ auto: attempts || 0, manual: 0 });
        pushRecentGuess(guessHex);
        setAutoEnabled(false);
        void handleClaim(guessHex);
      }
    };

    worker.postMessage({
      type: "start",
      commitmentHex: commitment,
      batchSize: AUTO_WORKER_BATCH,
      jitter: AUTO_WORKER_JITTER,
    });

    return () => {
      worker.postMessage({ type: "stop" });
      worker.terminate();
      workerRef.current = null;
    };
  }, [autoEnabled, commitment, handleClaim, recordAttempts, pushRecentGuess]);

  async function attemptGuess(rawGuess) {
    setError("");
    setStatus("");
    if (challengeEnded) {
      setStatus("Challenge already ended.");
      return;
    }

    const normalized = normalizeHex(rawGuess);
    if (!isHexString(normalized, 64)) {
      setError("Enter exactly 64 hex characters.");
      return;
    }

    pushRecentGuess(normalized);
    recordAttempts({ manual: 1, auto: 0 });

    let hashed;
    try {
      hashed = await sha256Hex(normalized);
    } catch (err) {
      setError("Hashing failed in this browser.");
      return;
    }

    if (hashed !== commitment) {
      setStatus("Nope. Not the key.");
      return;
    }

    await handleClaim(normalized);
  }

  async function handleManualAttempt() {
    await attemptGuess(guessInput);
  }

  async function handleRandomAttempt() {
    try {
      const randomHex = generateRandomHex();
      setGuessInput(randomHex);
      await attemptGuess(randomHex);
    } catch (err) {
      setError("Secure random generation is unavailable in this browser.");
    }
  }

  return (
    <main className="page">
      <section className="hero reveal">
        <div className="kicker">Asymmetric Challenge</div>
        <h1>Guess the 256-bit key. Win $100.</h1>
        <p>
          A 256-bit secret is locked behind a public SHA-256 commitment. Your
          device checks guesses on its own, so there’s no lag for each try. The
          first verified claim ends the challenge. It’s like the lottery, but
          you can try 100,000 times per second.
        </p>
      </section>

      <section className="panel reveal">
        {challengeEnded ? (
          <div className="banner">
            Challenge ended. The $100 prize has already been claimed.
          </div>
        ) : null}

        <div className="input-row">
          <label className="sr-only" htmlFor="guess-input">
            256-bit hexadecimal key guess
          </label>
          <input
            id="guess-input"
            className="input-field"
            value={guessInput}
            onChange={(event) => setGuessInput(event.target.value)}
            placeholder="Random 64-hex (edit or replace)"
            spellCheck={false}
          />
          <button
            className="button"
            type="button"
            onClick={handleManualAttempt}
            disabled={challengeEnded}
          >
            Check Guess
          </button>
          <button
            className="button secondary"
            type="button"
            onClick={handleRandomAttempt}
            disabled={challengeEnded}
          >
            Random Guess
          </button>
        </div>

        <div className="status" role="status" aria-live="polite">
          {status || "Awaiting your guess."}
        </div>
        {error ? (
          <div className="status" role="alert">
            {error}
          </div>
        ) : null}

        <div className={`toggle-row ${autoEnabled ? "active" : ""}`}>
          <div>
            <strong>Infinite mode</strong>
            <div className="status">
              Let it try nonstop. Stop it anytime.
            </div>
          </div>
          <button
            className={`toggle ${autoEnabled ? "active" : ""}`}
            type="button"
            aria-label="Toggle infinite mode"
            aria-pressed={autoEnabled}
            onClick={() => {
              if (!challengeEnded) {
                setAutoEnabled((prev) => !prev);
              }
            }}
            disabled={challengeEnded}
          >
            <span className="toggle-knob" />
          </button>
        </div>

        <div className="stats">
          <div className="stat-card">
            <span>Global attempts</span>
            <strong>
              {globalTotals ? globalTotals.total.toLocaleString() : "—"}
            </strong>
          </div>
          <div className="stat-card">
            <span>Auto attempts</span>
            <strong>{totals.auto.toLocaleString()}</strong>
          </div>
          <div className="stat-card">
            <span>Manual attempts</span>
            <strong>{totals.manual.toLocaleString()}</strong>
          </div>
          <div className="stat-card">
            <span>Total attempts</span>
            <strong>{totals.total.toLocaleString()}</strong>
          </div>
        </div>

        <div className="recent">
          <div className="status">Last 5 tried keys</div>
          <div className="recent-list">
            {recentGuesses.length ? (
              recentGuesses.map((guess, index) => (
                <div className="recent-item" key={`${guess}-${index}`}>
                  {guess}
                </div>
              ))
            ) : (
              <div className="status">No guesses yet.</div>
            )}
          </div>
        </div>

        {claimToken ? (
          <div className="banner">
            Claim token: <strong>{claimToken}</strong>
          </div>
        ) : null}
      </section>

      <section className="panel reveal">
        <div className="kicker">Commitment</div>
        <div className="status">Challenge ID: {challengeId}</div>
        <div className="hash-block">{commitmentHash}</div>
        <div className="status">
          Your browser hashes guesses and compares them to this commitment.
        </div>
      </section>

      <section className="panel reveal">
        <div className="kicker">Rules & Eligibility</div>
        <div className="rules">
          <p>
            Disclaimer: this site is a fictional demo and not a real prize
            offering.
          </p>
          <p>
            No purchase required. One verified winner receives the $100 prize and
            the challenge ends.
          </p>
          <p>
            Participation is free and for entertainment. Void where prohibited
            and subject to local laws.
          </p>
          <p>
            A claim requires the exact 256-bit secret. The server verifies
            claims. The server stores only aggregate attempt totals.
          </p>
        </div>
      </section>

      <footer className="footer reveal">
        <div>Asymmetric Challenge</div>
        <div>Built to prove how hard 2^256 really is.</div>
      </footer>
    </main>
  );
}

function generateRandomHex() {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return bytesToHex(bytes);
  }
  throw new Error("Secure random generation is unavailable");
}
