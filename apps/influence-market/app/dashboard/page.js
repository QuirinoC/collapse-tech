"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SiteHeader from "@/components/site-header";
import SiteFooter from "@/components/site-footer";

const TABS = {
  brand: ["campaigns", "new"],
  creator: ["marketplace", "work"],
};

export default function DashboardPage() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("campaigns");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/dashboard");
    if (response.ok) setData(await response.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then(async (meData) => {
        if (!meData?.profile) {
          router.push("/login");
          return;
        }
        setMe(meData.profile);
        await refresh();
      });
  }, [refresh, router]);

  async function act(url, body, method = "POST") {
    setStatus("Working…");
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const payload = await response.json().catch(() => ({}));
    setStatus(response.ok ? payload.message || "Done." : payload.error || "Failed.");
    if (response.ok) await refresh();
  }

  const role = me?.role;
  const tabs = TABS[role] || [];

  return (
    <main>
      <SiteHeader />
      <div className="page-head">
        <p className="eyebrow">{role === "brand" ? "Brand console" : "Creator studio"}</p>
        <h1>{me?.name || "Dashboard"}</h1>
      </div>
      <div className="page-body">
        {!loading && (
          <>
            <div className="dash-tabs">
              {tabs.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={tab === t ? "active" : ""}
                  onClick={() => setTab(t)}
                >
                  {t === "campaigns" && "My campaigns"}
                  {t === "new" && "+ New campaign"}
                  {t === "marketplace" && "Open briefs"}
                  {t === "work" && "My work & payouts"}
                </button>
              ))}
            </div>
            <p className="form-status" aria-live="polite">{status}</p>

            {role === "brand" && data && tab === "campaigns" && (
              <BrandCampaigns data={data} act={act} />
            )}
            {role === "brand" && tab === "new" && <NewCampaign act={act} />}
            {role === "creator" && data && tab === "marketplace" && (
              <CreatorMarketplace data={data} act={act} />
            )}
            {role === "creator" && data && tab === "work" && (
              <CreatorWork data={data} act={act} />
            )}
          </>
        )}
      </div>
      <SiteFooter />
    </main>
  );
}

/* ---------- Brand ---------- */

function BrandCampaigns({ data, act }) {
  if (!data.campaigns?.length) {
    return (
      <p className="lede">
        No campaigns yet. Create your first brief — it takes about two minutes.
      </p>
    );
  }
  return (
    <div className="dash-panel">
      {data.campaigns.map((c) => (
        <article key={c.id} className="panel-card">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
            <h3>{c.title}</h3>
            <StatusPill value={`${c.status} · ${c.paymentStatus}`} />
          </div>
          <p>{c.brief}</p>
          <p className="eyebrow" style={{ marginBottom: 0 }}>
            Budget ${(c.budgetCents / 100).toLocaleString()} · fee $
            {(c.feeCents / 100).toLocaleString()} · ${(c.perCreatorPayoutCents / 100).toLocaleString()}
            /slot × {c.creatorSlots}
          </p>

          {(c.applications || []).length > 0 && (
            <>
              <p className="eyebrow" style={{ marginTop: 18 }}>Applicants</p>
              {c.applications.map((a) => (
                <div key={a.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 12, marginTop: 12 }}>
                  <strong>{a.creatorName}</strong>{" "}
                  <span className="tag">{a.status}</span>
                  <p style={{ margin: "6px 0" }}>{a.pitch}</p>
                  {a.status === "pending" && c.slotsRemaining > 0 && (
                    <div className="inline-actions">
                      <button
                        type="button"
                        className="chip-button"
                        onClick={() => act(`/api/campaigns/${c.id}/applications`, { applicationId: a.id, decision: "accept" })}
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        className="chip-button secondary"
                        onClick={() => act(`/api/campaigns/${c.id}/applications`, { applicationId: a.id, decision: "decline" })}
                      >
                        Decline
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </>
          )}

          {(c.assignments || []).length > 0 && (
            <>
              <p className="eyebrow" style={{ marginTop: 18 }}>Roster &amp; deliverables</p>
              {c.assignments.map((asg) => (
                <div key={asg.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 12, marginTop: 12 }}>
                  <strong>{asg.creatorName}</strong> <span className={`status-pill ${asg.status}`}>{asg.status}</span>
                  {asg.contentUrl && (
                    <p style={{ margin: "6px 0", wordBreak: "break-all" }}>
                      Submitted:{" "}
                      <a href={asg.contentUrl} target="_blank" rel="noreferrer" className="text-link">
                        {asg.contentUrl}
                      </a>
                    </p>
                  )}
                  {asg.notes && <p style={{ margin: "6px 0" }}>{asg.notes}</p>}
                  {asg.status === "instructions_sent" && (
                    <p style={{ margin: "6px 0" }}>Awaiting submission. Instructions sent.</p>
                  )}
                  {asg.status === "submitted" && (
                    <div className="inline-actions">
                      <button
                        type="button"
                        className="chip-button"
                        onClick={() =>
                          act(`/api/assignments/${asg.id}/review`, {
                            decision: "approve",
                            notes: asg.notes,
                          })
                        }
                      >
                        Approve &amp; release ${((asg.payoutCents ?? c.perCreatorPayoutCents) / 100).toLocaleString()}
                      </button>
                      <button
                        type="button"
                        className="chip-button secondary"
                        onClick={() =>
                          act(`/api/assignments/${asg.id}/review`, {
                            decision: "reject",
                            notes: asg.notes || "Please revise per the brief.",
                          })
                        }
                      >
                        Request revision
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </>
          )}

          {c.canFund && (
            <div className="inline-actions">
              <button
                type="button"
                className="chip-button"
                onClick={() => act(`/api/campaigns/${c.id}/fund`, {})}
              >
                Fund campaign — pay ${(c.budgetCents / 100).toLocaleString()} now
              </button>
            </div>
          )}
          {(c.ledger || []).length > 0 && (
            <details style={{ marginTop: 14 }}>
              <summary className="eyebrow" style={{ cursor: "pointer" }}>Ledger</summary>
              {c.ledger.map((entry) => (
                <p key={entry.id} style={{ margin: "8px 0 0", fontFamily: "var(--font-plex-mono), monospace", fontSize: ".72rem" }}>
                  {entry.kind.toUpperCase()} · ${(entry.amountCents / 100).toLocaleString()} · {entry.description}
                </p>
              ))}
            </details>
          )}
        </article>
      ))}
    </div>
  );
}

function NewCampaign({ act }) {
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    const data = new FormData(event.currentTarget);
    await act(
      "/api/campaigns",
      {
        title: data.get("title"),
        brandName: data.get("brandName"),
        brief: data.get("brief"),
        demographics: data.get("demographics") || undefined,
        platforms: data.getAll("platforms").filter(Boolean),
        niches: data.getAll("niches").filter(Boolean),
        budgetCents: Math.round(Number(data.get("budget")) * 100),
        creatorSlots: Number(data.get("creatorSlots")),
      },
      "POST",
    );
    setBusy(false);
  }

  return (
    <form onSubmit={submit}>
      <div className="form-grid" style={{ maxWidth: 760 }}>
        <label className="full">
          Campaign title
          <input name="title" required minLength={4} placeholder="Vaporfly spring launch" />
        </label>
        <label className="full">
          Brand name
          <input name="brandName" required minLength={2} placeholder="Nike Running" />
        </label>
        <label className="full">
          Brief
          <textarea
            name="brief"
            required
            minLength={20}
            rows={5}
            placeholder="What to promote, how to test it, key messages, do's and don'ts."
          />
        </label>
        <label className="full">
          Target audience (optional)
          <input name="demographics" placeholder="Runners 22–40, urban US, marathon-adjacent" />
        </label>
        <PlatformsField />
        <NichesField />
        <label>
          Total budget (USD)
          <input name="budget" type="number" min={100} max={1000000} step={1} required placeholder="5000" />
        </label>
        <label>
          Creator slots
          <input name="creatorSlots" type="number" min={1} max={50} required defaultValue={4} />
        </label>
      </div>
      <button className="button" type="submit" disabled={busy}>
        Create campaign <span>↗</span>
      </button>
    </form>
  );
}

function PlatformsField() {
  const platforms = ["tiktok", "youtube", "instagram", "facebook", "x"];
  return (
    <fieldset className="full field-label" style={{ border: 0, padding: 0 }}>
      Platforms
      <div className="tag-row" style={{ marginTop: 6 }}>
        {platforms.map((p) => (
          <label key={p} style={{ display: "inline-flex", gap: 6, alignItems: "center", textTransform: "none", fontSize: ".85rem" }}>
            <input type="checkbox" name="platforms" value={p} /> {p}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function NichesField() {
  const niches = ["fitness", "beauty", "gaming", "food", "finance", "travel"];
  return (
    <fieldset className="field-label" style={{ border: 0, padding: 0 }}>
      Topics
      <div className="tag-row" style={{ marginTop: 6 }}>
        {niches.map((n) => (
          <label key={n} style={{ display: "inline-flex", gap: 6, alignItems: "center", textTransform: "none", fontSize: ".85rem" }}>
            <input type="checkbox" name="niches" value={n} /> {n}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/* ---------- Creator ---------- */

function CreatorMarketplace({ data, act }) {
  const open = (data.marketplace || []).filter((c) => !c.myApplicationId);
  if (!open.length) {
    return <p className="lede">No new briefs right now. Check back soon.</p>;
  }
  return (
    <div className="dash-panel">
      {open.map((c) => (
        <article key={c.id} className="panel-card">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
            <h3>{c.title}</h3>
            <span className="status-pill">${(c.perCreatorCents / 100).toLocaleString()} / slot</span>
          </div>
          <p>
            {c.brandName} · {c.slotsRemaining} slots left
          </p>
          <p>{c.brief}</p>
          <ApplyInline campaignId={c.id} act={act} />
        </article>
      ))}
    </div>
  );
}

function ApplyInline({ campaignId, act }) {
  const [pitch, setPitch] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        await act(`/api/campaigns/${campaignId}/apply`, { pitch });
        setBusy(false);
      }}
    >
      <label className="field-label" style={{ display: "grid", gap: 8, marginBottom: 10 }}>
        Pitch
        <textarea
          rows={2}
          required
          minLength={10}
          value={pitch}
          onChange={(e) => setPitch(e.target.value)}
          placeholder="One or two lines on your fit for this brief."
          style={{
            border: "0", borderBottom: "1px solid var(--line)", background: "transparent",
            padding: "6px 0", outline: "none", resize: "vertical", font: "inherit",
          }}
        />
      </label>
      <button type="submit" className="chip-button" disabled={busy}>
        Apply free
      </button>
    </form>
  );
}

function CreatorWork({ data, act }) {
  const earnings = data.earningsCents || 0;
  const assignments = data.assignments || [];
  const applications = data.applications || [];
  return (
    <div className="dash-panel">
      <article className="panel-card">
        <h3>Lifetime paid out</h3>
        <p style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: "1.9rem", color: "var(--ink)", fontWeight: 600 }}>
          ${(earnings / 100).toLocaleString()}
        </p>
      </article>

      {assignments.length > 0 && (
        <>
          <p className="eyebrow">Assignments</p>
          {assignments.map((asg) => (
            <AssignmentCard key={asg.id} asg={asg} act={act} />
          ))}
        </>
      )}

      {applications.length > 0 && (
        <>
          <p className="eyebrow" style={{ marginTop: 10 }}>Applications</p>
          {applications.map((a) => (
            <article key={a.id} className="panel-card">
              <strong>{a.campaignTitle || a.campaign?.title || a.campaignId}</strong>{" "}
              <span className="tag">{a.status}</span>
              <p style={{ margin: "8px 0 0" }}>{a.pitch}</p>
            </article>
          ))}
        </>
      )}

      {!assignments.length && !applications.length && (
        <p className="lede">
          Nothing yet — apply to an open brief and accepted work shows up here.
        </p>
      )}
    </div>
  );
}

function AssignmentCard({ asg, act }) {
  const campaign = asg.campaign || {};
  return (
    <article className="panel-card">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <h3>{campaign.title || "Campaign"}</h3>
        <span className={`status-pill ${asg.status}`}>{asg.status.replace(/_/g, " ")}</span>
      </div>
      <p>{campaign.brief}</p>
      {asg.instructions && (
        <>
          <p className="eyebrow" style={{ marginTop: 14 }}>Instructions</p>
          <p style={{ whiteSpace: "pre-wrap" }}>{asg.instructions}</p>
        </>
      )}
      {asg.payoutCents > 0 && (
        <p className="eyebrow" style={{ marginTop: 10 }}>
          Payout: ${(asg.payoutCents / 100).toLocaleString()}
          {asg.status === "paid" ? " · released" : " · held in escrow until approval"}
        </p>
      )}
      {["instructions_sent", "rejected"].includes(asg.status) && (
        <SubmitInline assignment={asg} act={act} />
      )}
    </article>
  );
}

function SubmitInline({ assignment, act }) {
  const [contentUrl, setContentUrl] = useState("");
  const [notes, setNotes] = useState(assignment.notes || "");
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        await act(`/api/assignments/${assignment.id}/submit`, {
          contentUrl,
          notes: notes || undefined,
        });
        setBusy(false);
      }}
      style={{ marginTop: 12 }}
    >
      <label className="field-label" style={{ display: "grid", gap: 8 }}>
        Content URL
        <input
          type="url"
          required
          value={contentUrl}
          onChange={(e) => setContentUrl(e.target.value)}
          placeholder="https://www.tiktok.com/@you/video/…"
        />
      </label>
      <label className="field-label" style={{ display: "grid", gap: 8, margin: "10px 0" }}>
        Notes (optional)
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <button type="submit" className="chip-button" disabled={busy}>
        {assignment.status === "rejected" ? "Resubmit revision" : "Submit content"}
      </button>
    </form>
  );
}

function StatusPill({ value }) {
  return <span className="status-pill">{value.replace(/_/g, " ")}</span>;
}
