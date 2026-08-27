"use client";

import { track } from "../lib/analytics";
import { useRouter } from "next/navigation";
import { useState } from "react";

const INSTAGRAM_URL = /^https?:\/\/(www\.)?instagram\.com\/(p|reel)\/[^/]+/i;

export default function SearchExperience({ compact = false, importsEnabled = false }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    const value = query.trim();
    if (!value) return;

    setBusy(true);
    setMessage("");

    try {
      if (INSTAGRAM_URL.test(value)) {
        if (!importsEnabled) {
          setMessage("Public-post imports are not available yet.");
          return;
        }
        const response = await fetch("/api/import", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sourceUrl: value }),
        });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error || "Import could not start.");
        }
        track("outfit_import_started");
        router.push(`/jobs/${result.jobId}`);
        return;
      }

      const response = await fetch(`/api/search?q=${encodeURIComponent(value)}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Search failed.");
      track("creator_search", { hasResults: result.people.length > 0 });

      if (result.people[0]) {
        router.push(`/people/${result.people[0].slug}`);
      } else {
        setMessage(
          "No profile yet. Paste a public Instagram post to start a look instead.",
        );
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className={`search-box ${compact ? "search-box-compact" : ""}`}
      onSubmit={handleSubmit}
    >
      <label htmlFor={compact ? "compact-search" : "hero-search"}>
        {importsEnabled ? "Person or public Instagram post" : "Person or style"}
      </label>
      <div>
        <span aria-hidden="true">⌕</span>
        <input
          id={compact ? "compact-search" : "hero-search"}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={
            importsEnabled ? "Shia LaBeouf or instagram.com/p/..." : "Shia LaBeouf"
          }
          value={query}
        />
        <button disabled={busy} type="submit">
          {busy ? "Working…" : "Find the fit"}
          <span aria-hidden="true">→</span>
        </button>
      </div>
      {message ? <p className="form-message">{message}</p> : null}
    </form>
  );
}
