"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SiteHeader from "@/components/site-header";
import SiteFooter from "@/components/site-footer";

const TABS = {
  brand: ["campaigns", "new"],
  creator: ["marketplace", "work", "profile"],
};

const CREATOR_PLATFORMS = [
  "instagram",
  "tiktok",
  "youtube",
  "facebook",
  "x",
  "twitch",
];

const CREATOR_NICHES = [
  "beauty",
  "fashion",
  "wellness",
  "lifestyle",
  "fitness",
  "food",
  "travel",
  "gaming",
  "tech",
  "finance",
  "education",
  "music",
  "sports",
  "automotive",
  "home",
  "pets",
];

export default function DashboardPage() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("campaigns");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/dashboard");
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setLoadError(payload.error || "Could not load your dashboard.");
        return;
      }
      setData(await response.json());
      setLoadError("");
    } catch {
      setLoadError("Could not connect. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((response) => {
        if (response.status === 401) return null;
        if (!response.ok) throw new Error("Could not load your account.");
        return response.json();
      })
      .then(async (meData) => {
        if (!meData?.profile) {
          router.push("/login");
          setLoading(false);
          return;
        }
        setMe(meData.profile);
        setTab(meData.profile.role === "brand" ? "campaigns" : "marketplace");
        await refresh();
      })
      .catch(() => {
        setLoadError("Could not connect. Check your connection and try again.");
        setLoading(false);
      });
  }, [refresh, router]);

  async function act(url, body, method = "POST") {
    setStatus("Working…");
    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      const payload = await response.json().catch(() => ({}));
      setStatus(response.ok ? payload.message || "Done." : payload.error || "Failed.");
      if (response.ok) await refresh();
      return { ok: response.ok, payload };
    } catch {
      setStatus("Could not connect. Check your connection and try again.");
      return { ok: false, payload: {} };
    }
  }

  const role = me?.role;
  const tabs = TABS[role] || [];

  return (
    <main>
      <SiteHeader />
      <div className="page-head dashboard-head">
        <p className="eyebrow">{role === "brand" ? "Brand console" : "Creator studio"}</p>
        <h1>{me?.name || "Dashboard"}</h1>
      </div>
      <div className="page-body">
        {loading && <p className="dashboard-loading">Loading your workspace…</p>}
        {loadError && !loading && (
          <div className="payment-notice error-notice">
            <p>{loadError}</p>
            <button
              type="button"
              className="chip-button"
              onClick={() => window.location.reload()}
            >
              Retry
            </button>
          </div>
        )}
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
                  {t === "profile" && "Public profile"}
                </button>
              ))}
            </div>
            <p className="form-status" aria-live="polite">{status}</p>

            {role === "brand" && data && tab === "campaigns" && (
              <BrandCampaigns data={data} act={act} />
            )}
            {role === "brand" && tab === "new" && (
              <NewCampaign act={act} onCreated={() => setTab("campaigns")} />
            )}
            {role === "creator" && data && tab === "marketplace" && (
              <CreatorMarketplace data={data} act={act} />
            )}
            {role === "creator" && data && tab === "work" && (
              <CreatorWork data={data} act={act} />
            )}
            {role === "creator" && tab === "profile" && (
              <CreatorProfile
                profile={me}
                onSaved={(profile) => setMe((current) => ({ ...current, ...profile }))}
                setStatus={setStatus}
              />
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
            {(c.feeCents / 100).toLocaleString()} · creator payout pool $
            {(c.payoutPoolCents / 100).toLocaleString()} across {c.slots} slots
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
                  {asg.notes && (
                    <p style={{ margin: "6px 0" }}>
                      <strong>Latest note:</strong> {asg.notes}
                    </p>
                  )}
                  {asg.status === "instructions_sent" && (
                    <p style={{ margin: "6px 0" }}>Awaiting submission. Instructions sent.</p>
                  )}
                  {["submitted", "approved"].includes(asg.status) && (
                    <ReviewActions
                      assignment={asg}
                      campaign={c}
                      act={act}
                      retry={asg.status === "approved"}
                    />
                  )}
                </div>
              ))}
            </>
          )}

          {c.canFund && data.payments?.ready && (
            <div className="inline-actions">
              <button
                type="button"
                className="chip-button"
                onClick={() => act(`/api/campaigns/${c.id}/fund`, {})}
              >
                {c.fundingPending
                  ? "Retry funding reconciliation"
                  : `Fund campaign — pay $${(c.budgetCents / 100).toLocaleString()} now`}
              </button>
            </div>
          )}
          {c.canFund && !data.payments?.ready && (
            <p className="payment-notice">
              {data.payments?.message || "Online funding is not enabled yet."}
            </p>
          )}
          {(c.ledger || []).length > 0 && (
            <details style={{ marginTop: 14 }}>
              <summary className="eyebrow" style={{ cursor: "pointer" }}>Ledger</summary>
              {c.ledger.map((entry) => (
                <p key={entry.id} style={{ margin: "8px 0 0", fontFamily: "var(--font-plex-mono), monospace", fontSize: ".72rem" }}>
                  {entry.kind.toUpperCase()} · ${(entry.amountCents / 100).toLocaleString()} · {entry.memo}
                </p>
              ))}
            </details>
          )}
        </article>
      ))}
    </div>
  );
}

function ReviewActions({ assignment, campaign, act, retry = false }) {
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function review(decision) {
    setBusy(true);
    await act(`/api/assignments/${assignment.id}/review`, {
      decision,
      notes:
        notes.trim() ||
        (decision === "reject" ? "Please revise the content to match the brief." : undefined),
    });
    setBusy(false);
  }

  return (
    <div className="review-actions">
      {!retry && (
        <label className="field-label">
          Review note (required when requesting a revision)
          <textarea
            className="inline-pitch"
            rows={2}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Call out the approved deliverables or the exact revision needed."
          />
        </label>
      )}
      <div className="inline-actions">
        <button
          type="button"
          className="chip-button"
          disabled={busy}
          onClick={() => review("approve")}
        >
          {retry ? "Retry payout" : "Approve & release"} · $
          {((assignment.payoutCents ?? campaign.perCreatorPayoutCents) / 100).toLocaleString()}
        </button>
        {!retry && (
          <button
            type="button"
            className="chip-button secondary"
            disabled={busy}
            onClick={() => review("reject")}
          >
            Request revision
          </button>
        )}
      </div>
    </div>
  );
}

function NewCampaign({ act, onCreated }) {
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    const form = event.currentTarget;
    const data = new FormData(form);
    const result = await act(
      "/api/campaigns",
      {
        title: data.get("title"),
        brandName: data.get("brandName"),
        brief: data.get("brief"),
        productInfo: data.get("productInfo") || undefined,
        demographics: data.get("demographics") || undefined,
        platforms: data.getAll("platforms").filter(Boolean),
        niches: data.getAll("niches").filter(Boolean),
        followerMin: data.get("followerMin")
          ? Number(data.get("followerMin"))
          : undefined,
        followerMax: data.get("followerMax")
          ? Number(data.get("followerMax"))
          : undefined,
        budgetCents: Math.round(Number(data.get("budget")) * 100),
        slots: Number(data.get("creatorSlots")),
      },
      "POST",
    );
    setBusy(false);
    if (result.ok) {
      form.reset();
      onCreated();
    }
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
            minLength={30}
            rows={5}
            placeholder="What to promote, how to test it, key messages, do's and don'ts."
          />
        </label>
        <label className="full">
          Product and fulfillment
          <textarea
            name="productInfo"
            rows={3}
            maxLength={1500}
            placeholder="What creators receive, who ships it, and any reimbursement details."
          />
        </label>
        <label className="full">
          Target audience (optional)
          <input name="demographics" placeholder="Runners 22–40, urban US, marathon-adjacent" />
        </label>
        <PlatformsField />
        <NichesField />
        <label>
          Minimum followers (optional)
          <input name="followerMin" type="number" min={0} step={1} placeholder="10000" />
        </label>
        <label>
          Maximum followers (optional)
          <input name="followerMax" type="number" min={0} step={1} placeholder="250000" />
        </label>
        <label>
          Total budget, fee included (USD)
          <input name="budget" type="number" min={100} max={1000000} step={1} required placeholder="5000" />
          <small className="helper-text">82% funds creator payouts; 18% is the platform fee.</small>
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
  return (
    <fieldset className="full field-label" style={{ border: 0, padding: 0 }}>
      Platforms
      <div className="option-grid">
        {CREATOR_PLATFORMS.map((p) => (
          <label key={p} className="option-chip">
            <input type="checkbox" name="platforms" value={p} />
            <span>{p}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function NichesField() {
  return (
    <fieldset className="full field-label" style={{ border: 0, padding: 0 }}>
      Topics
      <div className="option-grid">
        {CREATOR_NICHES.map((n) => (
          <label key={n} className="option-chip">
            <input type="checkbox" name="niches" value={n} />
            <span>{n}</span>
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
            <span className="status-pill">From ${(c.perCreatorCents / 100).toLocaleString()} / slot</span>
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
          minLength={20}
          value={pitch}
          onChange={(e) => setPitch(e.target.value)}
          placeholder="One or two lines on your fit for this brief."
          className="inline-pitch"
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
        <p className="earnings-total">
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
          {asg.status === "paid"
            ? " · released"
            : campaign.paymentStatus === "held"
              ? " · held until approval"
              : " · proposed; funding unavailable"}
        </p>
      )}
      {asg.notes && (
        <p style={{ marginTop: 10 }}>
          <strong>Latest note:</strong> {asg.notes}
        </p>
      )}
      {["instructions_sent", "rejected"].includes(asg.status) &&
        campaign.paymentStatus === "held" && (
        <SubmitInline assignment={asg} act={act} />
      )}
      {["instructions_sent", "rejected"].includes(asg.status) &&
        campaign.paymentStatus !== "held" && (
          <p className="payment-notice">
            This is a proposed rate. Funding is not available for this campaign,
            so no content submission is required.
          </p>
        )}
    </article>
  );
}

function SubmitInline({ assignment, act }) {
  const [contentUrl, setContentUrl] = useState("");
  const [notes, setNotes] = useState(
    assignment.status === "rejected" ? "" : assignment.notes || "",
  );
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

function CreatorProfile({ profile, onSaved, setStatus }) {
  const [bio, setBio] = useState(profile?.bio || "");
  const [niches, setNiches] = useState(profile?.niches || []);
  const [minBudget, setMinBudget] = useState(
    profile?.minBudgetCents != null ? String(profile.minBudgetCents / 100) : "",
  );
  const [channels, setChannels] = useState(() => {
    const existing = profile?.channels || [];
    if (!existing.length) {
      return [{ platform: "instagram", handle: "", followers: "", topic: "lifestyle" }];
    }
    return existing.map((channel) => ({
      platform: channel.platform,
      handle: channel.handle,
      followers: String(channel.followers ?? ""),
      topic: channel.topics?.[0] || "lifestyle",
    }));
  });
  const [busy, setBusy] = useState(false);

  function toggleNiche(niche) {
    setNiches((current) => {
      if (current.includes(niche)) return current.filter((item) => item !== niche);
      if (current.length >= 6) return current;
      return [...current, niche];
    });
  }

  function updateChannel(index, field, value) {
    setChannels((current) =>
      current.map((channel, channelIndex) =>
        channelIndex === index ? { ...channel, [field]: value } : channel,
      ),
    );
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setStatus("Saving profile…");
    const normalizedChannels = channels
      .filter((channel) => channel.handle.trim())
      .map((channel) => ({
        platform: channel.platform,
        handle: channel.handle.trim(),
        followers: Number(channel.followers) || 0,
        topics: [channel.topic],
      }));
    const payload = {
      bio,
      niches,
      channels: normalizedChannels,
      ...(minBudget.trim()
        ? { minBudgetCents: Math.round(Number(minBudget) * 100) }
        : { minBudgetCents: 0 }),
    };

    try {
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus(data.error || "Could not save your profile.");
        return;
      }
      onSaved(data.profile);
      setStatus("Profile saved. Your creator listing is live.");
    } catch {
      setStatus("Could not connect. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="profile-form" onSubmit={submit}>
      <div className="profile-intro">
        <p className="eyebrow">Your public listing</p>
        <h2>Show brands why you&apos;re the right fit.</h2>
        <p>
          Keep your audience and rates current. Brands use these signals to build
          their campaign shortlists.
        </p>
      </div>

      <label className="field-label">
        Bio
        <textarea
          rows={4}
          maxLength={600}
          value={bio}
          onChange={(event) => setBio(event.target.value)}
          placeholder="What you make, who follows you, and what your audience trusts you for."
        />
      </label>

      <fieldset className="field-label profile-fieldset">
        Content niches <small>Choose up to six.</small>
        <div className="option-grid">
          {CREATOR_NICHES.map((niche) => {
            const selected = niches.includes(niche);
            return (
              <label key={niche} className="option-chip">
                <input
                  type="checkbox"
                  checked={selected}
                  disabled={!selected && niches.length >= 6}
                  onChange={() => toggleNiche(niche)}
                />
                <span>{niche}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <label className="field-label profile-budget">
        Minimum campaign payout (USD)
        <input
          type="number"
          min={0}
          step={1}
          value={minBudget}
          onChange={(event) => setMinBudget(event.target.value)}
          placeholder="250"
        />
      </label>

      <div className="channel-editor">
        <div className="channel-editor-head">
          <div>
            <p className="eyebrow">Channels</p>
            <h3>Where your audience lives</h3>
          </div>
          {channels.length < 8 && (
            <button
              type="button"
              className="chip-button secondary"
              onClick={() =>
                setChannels((current) => [
                  ...current,
                  { platform: "tiktok", handle: "", followers: "", topic: "lifestyle" },
                ])
              }
            >
              + Add channel
            </button>
          )}
        </div>

        {channels.map((channel, index) => (
          <div className="channel-row" key={`${index}-${channel.platform}`}>
            <label>
              Platform
              <select
                value={channel.platform}
                onChange={(event) => updateChannel(index, "platform", event.target.value)}
              >
                {CREATOR_PLATFORMS.map((platform) => (
                  <option key={platform} value={platform}>{platform}</option>
                ))}
              </select>
            </label>
            <label>
              Handle
              <input
                value={channel.handle}
                onChange={(event) => updateChannel(index, "handle", event.target.value)}
                placeholder="@yourhandle"
                maxLength={80}
              />
            </label>
            <label>
              Followers
              <input
                type="number"
                min={0}
                max={500000000}
                value={channel.followers}
                onChange={(event) => updateChannel(index, "followers", event.target.value)}
                placeholder="25000"
              />
            </label>
            <label>
              Primary topic
              <select
                value={channel.topic}
                onChange={(event) => updateChannel(index, "topic", event.target.value)}
              >
                {CREATOR_NICHES.map((niche) => (
                  <option key={niche} value={niche}>{niche}</option>
                ))}
              </select>
            </label>
            {channels.length > 1 && (
              <button
                type="button"
                className="remove-channel"
                aria-label={`Remove ${channel.platform} channel`}
                onClick={() =>
                  setChannels((current) =>
                    current.filter((_, channelIndex) => channelIndex !== index),
                  )
                }
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>

      <button className="button profile-save" type="submit" disabled={busy}>
        {busy ? "Saving…" : "Save public profile"} <span>↗</span>
      </button>
    </form>
  );
}

function StatusPill({ value }) {
  return <span className="status-pill">{value.replace(/_/g, " ")}</span>;
}
