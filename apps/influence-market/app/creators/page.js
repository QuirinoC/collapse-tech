"use client";

import { useEffect, useMemo, useState } from "react";
import SiteHeader from "@/components/site-header";
import SiteFooter from "@/components/site-footer";
import { PLATFORMS, NICHES } from "@/lib/schemas";

export default function CreatorsPage() {
  const [creators, setCreators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [platform, setPlatform] = useState("");
  const [niche, setNiche] = useState("");
  const [minFollowers, setMinFollowers] = useState("");

  useEffect(() => {
    const params = new URLSearchParams();
    if (platform) params.set("platform", platform);
    if (niche) params.set("niche", niche);
    if (minFollowers) params.set("minFollowers", minFollowers);
    fetch(`/api/creators?${params}`)
      .then((r) => r.json())
      .then((data) => setCreators(data.creators || []))
      .finally(() => setLoading(false));
  }, [platform, niche, minFollowers]);

  const followerTotal = useMemo(
    () =>
      creators.reduce(
        (sum, c) =>
          sum +
          Math.max(0, ...(c.channels || []).map((ch) => ch.followers || 0)),
        0,
      ),
    [creators],
  );

  return (
    <main>
      <SiteHeader />
      <div className="page-head">
        <p className="eyebrow">The roster</p>
        <h1>Creators</h1>
        <p className="lede">
          Every listing is vetted with live channel metrics. Filter by platform,
          topic and audience size to preview who your brief reaches.
        </p>
      </div>
      <div className="page-body">
        <div className="filter-bar">
          <select value={platform} onChange={(e) => setPlatform(e.target.value)} aria-label="Platform">
            <option value="">All platforms</option>
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <select value={niche} onChange={(e) => setNiche(e.target.value)} aria-label="Topic">
            <option value="">All topics</option>
            {NICHES.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <input
            type="number"
            placeholder="Min followers"
            min={0}
            value={minFollowers}
            onChange={(e) => setMinFollowers(e.target.value)}
            aria-label="Minimum followers"
          />
        </div>
        {loading ? (
          <p className="eyebrow">Loading roster…</p>
        ) : creators.length === 0 ? (
          <p className="lede">No creators match those filters yet. Widen them or contact us.</p>
        ) : (
          <div className="card-list">
            {creators.map((creator) => (
              <CreatorCard key={creator.id} creator={creator} />
            ))}
          </div>
        )}
        {!loading && creators.length > 0 && (
          <p className="eyebrow" style={{ marginTop: 26 }}>
            {creators.length} creator{creators.length === 1 ? "" : "s"} ·{" "}
            {followerTotal.toLocaleString()} combined followers
          </p>
        )}
      </div>
      <SiteFooter />
    </main>
  );
}

function CreatorCard({ creator }) {
  return (
    <article className="creator-card">
      <div className="creator-identity">
        <span className="creator-avatar" aria-hidden="true">
          {creator.name
            .split(/\s+/)
            .slice(0, 2)
            .map((part) => part[0])
            .join("")
            .toUpperCase()}
        </span>
        <div>
          <h3 className="creator-name">{creator.name}</h3>
          <p className="creator-bio">{creator.bio}</p>
          <div className="tag-row">
            {(creator.niches || []).map((n) => (
              <span key={n} className="tag">{n}</span>
            ))}
          </div>
        </div>
      </div>
      <div className="tag-row">
        {(creator.channels || []).map((ch) => (
          <span key={`${creator.id}-${ch.platform}`} className="tag">
            {ch.platform} · {ch.handle} · {ch.followers.toLocaleString()}
          </span>
        ))}
      </div>
      <div className="meta-col">
        <span>From ${((creator.minBudgetCents || 0) / 100).toLocaleString()}</span>
        <a href="/signup" className="text-link">
          Brief this roster <span>→</span>
        </a>
      </div>
    </article>
  );
}
