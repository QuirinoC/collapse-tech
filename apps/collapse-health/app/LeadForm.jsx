"use client";

import { useState } from "react";

const PROCEDURES = [
  "Gastric sleeve / bariatric",
  "Dental implants & cosmetic dentistry",
  "Cosmetic surgery",
  "Orthopedic surgery (hip/knee)",
  "Fertility (IVF)",
  "Other / not sure yet",
];

export default function LeadForm() {
  const [status, setStatus] = useState(null);
  const [sending, setSending] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setSending(true);
    setStatus(null);
    const form = new FormData(e.target);
    // Static export has no API routes — leads are captured via the
    // configured endpoint env var (e.g., a Formspree/Worker URL) baked at build.
    const endpoint = process.env.NEXT_PUBLIC_LEAD_ENDPOINT;
    try {
      if (!endpoint) throw new Error("no-endpoint");
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(Object.fromEntries(form.entries())),
      });
      if (!res.ok) throw new Error("bad-status");
      setStatus({ ok: true, msg: "Thanks! A care coordinator will reach out within one business day." });
      e.target.reset();
    } catch {
      setStatus({
        ok: false,
        msg: "We couldn't send your request just now — email hello@collapsetechnologies.com and we'll take it from there.",
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <form className="lead-form" onSubmit={onSubmit}>
      <label>
        Full name
        <input name="name" required autoComplete="name" />
      </label>
      <label>
        Email
        <input type="email" name="email" required autoComplete="email" />
      </label>
      <label>
        Phone (optional)
        <input type="tel" name="phone" autoComplete="tel" />
      </label>
      <label>
        Procedure of interest
        <select name="procedure" required defaultValue="">
          <option value="" disabled>
            Select a procedure…
          </option>
          {PROCEDURES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
      <label>
        Anything we should know? (optional)
        <textarea name="notes" rows="3" />
      </label>
      <button className="btn btn-primary" type="submit" disabled={sending}>
        {sending ? "Sending…" : "Request my free quote"}
      </button>
      <p className={`form-status ${status ? (status.ok ? "ok" : "err") : ""}`}>
        {status?.msg}
      </p>
    </form>
  );
}
