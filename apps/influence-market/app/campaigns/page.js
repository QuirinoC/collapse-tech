"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import SiteHeader from "@/components/site-header";
import SiteFooter from "@/components/site-footer";

const STATUS_LABELS = {
  open: "Open",
  funded: "In production",
  completed: "Completed",
  cancelled: "Cancelled",
};

export default function CampaignsPage() {
  const [scope, setScope] = useState("marketplace");
  const [campaigns, setCampaigns] = useState([]);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((me) => {
        if (me?.profile) {
          setRole(me.profile.role);
          if (me.profile.role === "brand") setScope("mine");
        }
      });
  }, []);

  useEffect(() => {
    let active = true;
    fetch(`/api/campaigns?scope=${scope}`)
      .then((r) => (r.ok ? r.json() : { campaigns: [] }))
      .then((data) => {
        if (!active) return;
        setCampaigns(data.campaigns || []);
        setLoading(false);
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [scope]);

  return (
    <main>
      <SiteHeader />
      <div className="page-head">
        <p className="eyebrow">Live briefs</p>
        <h1>Campaigns</h1>
        <p className="lede">
          Browse creator briefs and proposed rates. Funding is not yet available
          on the production site.
        </p>
      </div>
      <div className="page-body">
        {role && (
          <div className="dash-tabs">
            <button
              type="button"
              className={scope === "marketplace" ? "active" : ""}
              onClick={() => setScope("marketplace")}
            >
              Marketplace
            </button>
            <button
              type="button"
              className={scope === "mine" ? "active" : ""}
              onClick={() => setScope("mine")}
            >
              {role === "brand" ? "My campaigns" : "Applied"}
            </button>
          </div>
        )}
        {loading ? (
          <p className="eyebrow">Loading campaigns…</p>
        ) : campaigns.length === 0 ? (
          <p className="lede">
            No campaigns here yet.{" "}
            {role === "brand" ? (
              <Link href="/dashboard" className="text-link">
                Create one in your dashboard <span>→</span>
              </Link>
            ) : (
              <Link href="/signup" className="text-link">
                Join as a creator <span>→</span>
              </Link>
            )}
          </p>
        ) : (
          <div className="card-list">
            {campaigns.map((campaign) => (
              <Link
                key={campaign.id}
                href={`/campaigns/${campaign.id}`}
                className="campaign-card"
                style={{ color: "inherit", display: "grid" }}
              >
                <div>
                  <h3 className="campaign-title">{campaign.title}</h3>
                  <p className="campaign-desc">
                    {campaign.brandName} · {campaign.slotsRemaining} of{" "}
                    {campaign.creatorSlots} slots open
                  </p>
                  <div className="tag-row">
                    {(campaign.niches || []).map((n) => (
                      <span key={n} className="tag">{n}</span>
                    ))}
                    {(campaign.platforms || []).map((p) => (
                      <span key={p} className="tag">{p}</span>
                    ))}
                  </div>
                </div>
                <p className="campaign-desc" style={{ margin: 0 }}>
                  {campaign.brief}
                </p>
                <div className="meta-col">
                  {scope === "mine" && campaign.applicationStatus ? (
                    <ApplicationPill status={campaign.applicationStatus} />
                  ) : (
                    <StatusPill campaign={campaign} />
                  )}
                  <span>From ${(campaign.perCreatorCents / 100).toLocaleString()} / slot</span>
                  <span>Budget ${(campaign.budgetCents / 100).toLocaleString()}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
      <SiteFooter />
    </main>
  );
}

function StatusPill({ campaign }) {
  const label =
    STATUS_LABELS[campaign.status] ||
    (campaign.paymentStatus === "held" ? "Escrowed" : campaign.status);
  const cls =
    campaign.status === "funded" || campaign.paymentStatus === "held"
      ? "status-pill held"
      : "status-pill";
  return <span className={cls}>{label}</span>;
}

const APPLICATION_LABELS = {
  pending: "Application pending",
  accepted: "Accepted",
  declined: "Not selected",
  withdrawn: "Withdrawn",
};

function ApplicationPill({ status }) {
  const cls =
    status === "accepted" || status === "pending"
      ? "status-pill held"
      : "status-pill";
  return <span className={cls}>{APPLICATION_LABELS[status] || status}</span>;
}
