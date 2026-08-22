"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

  const clientIdRef = useRef(null);
  const autoEnabledRef = useRef(false);
  const totalsRef = useRef({ total: 0, manual: 0, auto: 0 });
  const batchRef = useRef({
    startAt: null,
    total: 0,
    manual: 0,
    auto: 0,
    lastSentAt: 0,
  });
  const workerRef = useRef(null);

  const sessionId = useMemo(() => generateUuid(), []);
  const initialGuess = useMemo(() => generateRandomHex(), []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGuessInput((current) => current || initialGuess);
  }, [initialGuess]);

  useEffect(() => {
    const storageKey = "ac_client_id";
    let stored = null;
    try {
      stored = localStorage.getItem(storageKey);
    } catch (err) {
      stored = null;
    }
    if (!stored) {
      stored = generateUuid();
      try {
        localStorage.setItem(storageKey, stored);
      } catch (err) {
        // ignore storage failures
      }
    }
    clientIdRef.current = stored;
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

  useEffect(() => {
    autoEnabledRef.current = autoEnabled;
  }, [autoEnabled]);

  const buildTelemetryPayload = useCallback(
    (endedAt) => {
      const clientId = clientIdRef.current;
      if (!clientId || !batchRef.current.startAt || batchRef.current.total === 0) {
        return null;
      }

      return {
        clientId,
        sessionId,
        startedAt: batchRef.current.startAt,
        endedAt,
        attemptsTotal: batchRef.current.total,
        attemptsAuto: batchRef.current.auto,
        attemptsManual: batchRef.current.manual,
        autoEnabled: autoEnabledRef.current,
      };
    },
    [sessionId]
  );

  const flushTelemetry = useCallback(
    (useBeacon) => {
      const endedAt = Date.now();
      const payload = buildTelemetryPayload(endedAt);
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

      const clientId = clientIdRef.current;
      if (!clientId) {
        setError("Client ID unavailable. Try again.");
        return;
      }

      const response = await fetch("/api/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guessHex, clientId, sessionId }),
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
    },
    [sessionId]
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
        handleClaim(guessHex);
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
    const randomHex = generateRandomHex();
    setGuessInput(randomHex);
    await attemptGuess(randomHex);
  }

  return (
    <main className="page">
      <a
        className="studio-wordmark"
        href="https://collapsetechnologies.com"
        aria-label="Back to Collapse Technologies"
      >
        <span>Collapse</span>
        <span>Technologies</span>
      </a>

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
          <input
            className="input-field"
            value={guessInput}
            onChange={(event) => setGuessInput(event.target.value)}
            placeholder="Random 64-hex (edit or replace)"
            spellCheck={false}
          />
          <button
            className="button"
            onClick={handleManualAttempt}
            disabled={challengeEnded}
          >
            Check Guess
          </button>
          <button
            className="button secondary"
            onClick={handleRandomAttempt}
            disabled={challengeEnded}
          >
            Random Guess
          </button>
        </div>

        <div className="status">{error || status || "Awaiting your guess."}</div>

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
            claims; no per-guess data is stored server-side.
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

function generateUuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return `fallback-${Math.random().toString(16).slice(2)}`;
}

function generateRandomHex() {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return bytesToHex(bytes);
  }
  let hex = "";
  for (let i = 0; i < 64; i += 1) {
    hex += Math.floor(Math.random() * 16).toString(16);
  }
  return hex;
}
