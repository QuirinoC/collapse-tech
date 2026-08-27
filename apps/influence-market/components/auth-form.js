"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AuthForm({ mode }) {
  const router = useRouter();
  const [role, setRole] = useState("brand");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const body =
      mode === "signup"
        ? {
            email: data.get("email"),
            password: data.get("password"),
            role,
            name: data.get("name"),
            ...(role === "brand" ? { company: data.get("company") } : {}),
          }
        : { email: data.get("email"), password: data.get("password") };

    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const { error: message } = await response.json().catch(() => ({}));
        setError(message || "Something went wrong. Try again.");
        return;
      }
      router.push("/dashboard");
    } catch {
      setError("Could not connect. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      {mode === "signup" && (
        <>
          <div className="role-toggle" role="group" aria-label="Account type">
            <button
              type="button"
              className={role === "brand" ? "active" : ""}
              aria-pressed={role === "brand"}
              onClick={() => setRole("brand")}
            >
              I&apos;m a brand
            </button>
            <button
              type="button"
              className={role === "creator" ? "active" : ""}
              aria-pressed={role === "creator"}
              onClick={() => setRole("creator")}
            >
              I&apos;m a creator
            </button>
          </div>
          <label>
            Name
            <input name="name" autoComplete="name" required minLength={2} />
          </label>
          {role === "brand" && (
            <label>
              Company
              <input name="company" autoComplete="organization" maxLength={160} />
            </label>
          )}
        </>
      )}
      <label>
        Email
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label>
        Password
        <input
          name="password"
          type="password"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          minLength={mode === "signup" ? 10 : undefined}
          required
        />
      </label>
      <button className="button" type="submit" disabled={busy}>
        {busy ? "Working…" : mode === "signup" ? "Create account" : "Log in"}{" "}
        <span>↗</span>
      </button>
      <p className="form-status" aria-live="polite">
        {error}
      </p>
    </form>
  );
}
