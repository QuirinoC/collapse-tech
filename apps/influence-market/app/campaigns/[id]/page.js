"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import SiteHeader from "@/components/site-header";
import SiteFooter from "@/components/site-footer";

export default function CampaignDetailPage() {
  const params = useParams();
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const [campaign, setCampaign] = useState(null);
  const [me, setMe] = useState(null);
  const [pitch, setPitch] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const [campaignRes, meRes] = await Promise.all([
      fetch(`/api/campaigns/${id}`),
      fetch("/api/auth/me"),
    ]);
    if (campaignRes.ok) setCampaign(await campaignRes.json());
    if (meRes.ok) setMe(await meRes.json());
  }

  useEffect(() => {
    if (!id) return undefined;
    let active = true;
    Promise.all([
      fetch(`/api/campaigns/${id}`).then((r) => (r.ok ? r.json() : null)),
      fetch("/api/auth/me").then((r) => (r.ok ? r.json() : null)),
    ]).then(([campaignData, meData]) => {
      if (!active) return;
      if (campaignData) setCampaign(campaignData);
      if (meData) setMe(meData);
    });
    return () => {
      active = false;
    };
  }, [id]);

  async function apply(event) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    const response = await fetch(`/api/campaigns/${id}/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pitch }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (response.ok) {
      setPitch("");
      setStatus("Application sent. Watch your dashboard for the decision.");
      load();
    } else {
      setStatus(data.error || "Could not apply.");
    }
  }

  if (!campaign) {
    return (
      <main>
        <SiteHeader />
        <div className="page-head">
          <h1>Campaign</h1>
          <p className="eyebrow">{status || "Loading…"}</p>
        </div>
        <SiteFooter />
      </main>
    );
  }

  const c = campaign.campaign;
  const isCreator = me?.profile?.role === "creator";
  const alreadyApplied = Boolean(campaign.myApplication);

  return (
    <main>
      <SiteHeader />
      <div className="page-head">
        <p className="eyebrow">
          {c.brandName} · {(c.niches || []).join(" / ")}
        </p>
        <h1>{c.title}</h1>
      </div>
      <div className="page-body">
        <div className="split-grid" style={{ marginBottom: 48 }}>
          <div>
            <p className="eyebrow">The brief</p>
            <p style={{ color: "var(--muted)", lineHeight: 1.55 }}>{c.brief}</p>
            {c.demographics && (
              <>
                <p className="eyebrow" style={{ marginTop: 24 }}>Audience</p>
                <p style={{ color: "var(--muted)", lineHeight: 1.55 }}>{c.demographics}</p>
              </>
            )}
            <div className="tag-row" style={{ marginTop: 20 }}>
              {(c.platforms || []).map((p) => (
                <span key={p} className="tag">{p}</span>
              ))}
              {(c.niches || []).map((n) => (
                <span key={n} className="tag">{n}</span>
              ))}
            </div>
          </div>
          <div className="stat-band" style={{ gridTemplateColumns: "1fr", marginBottom: 0 }}>
            <StatCell value={`$${(c.perCreatorCents / 100).toLocaleString()}`} label="Per creator slot" />
            <StatCell value={`${c.slotsRemaining}`} label="Slots remaining" />
            <StatCell value={c.paymentStatus === "held" ? "Escrowed" : "Pending"} label="Funding status" />
          </div>
        </div>

        {isCreator && !alreadyApplied && c.status === "open" && c.slotsRemaining > 0 && (
          <form onSubmit={apply} style={{ maxWidth: 560 }}>
            <p className="eyebrow">Apply for this brief</p>
            <label className="field-label" style={{ display: "grid", gap: 8 }}>
              Your pitch
              <textarea
                rows={4}
                required
                minLength={10}
                value={pitch}
                onChange={(e) => setPitch(e.target.value)}
                placeholder="Why you're the right fit: audience overlap, past brand work, format idea."
                style={{
                  border: "0", borderBottom: "1px solid var(--line)", background: "transparent",
                  padding: "7px 0", outline: "none", resize: "vertical", font: "inherit",
                }}
              />
            </label>
            <button className="button" type="submit" disabled={busy}>
              Apply free <span>↗</span>
            </button>
          </form>
        )}

        {isCreator && alreadyApplied && (
          <p className="form-status">
            Application {campaign.myApplication.status}. Check{" "}
            <a href="/dashboard" className="text-link">your dashboard <span>→</span></a>
          </p>
        )}
        {!me && (
          <p className="lede">
            <a href="/signup" className="text-link">
              Join as a creator to apply <span>→</span>
            </a>
          </p>
        )}
        <p className="form-status" aria-live="polite">{status}</p>
      </div>
      <SiteFooter />
    </main>
  );
}

function StatCell({ value, label }) {
  return (
    <div className="stat-cell">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
