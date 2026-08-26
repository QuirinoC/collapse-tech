// In-memory store implementing the same interface as the Supabase store.
// Used when Supabase env vars are absent (local dev / demo) and in unit tests.
// Seeded with a small curated roster so the directory is never empty.

import { randomUUID } from "node:crypto";

const DEMO_CREATORS = [
  {
    email: "maya.runs@example.com",
    name: "Maya Torres",
    bio: "Marathoner documenting city running, shoe science, and race-day nutrition.",
    niches: ["fitness", "sports"],
    channels: [
      { platform: "instagram", handle: "maya.runs", followers: 48200, topics: ["fitness", "sports"] },
      { platform: "youtube", handle: "@MayaRuns", followers: 91000, topics: ["fitness", "tech"] },
      { platform: "tiktok", handle: "maya.runs", followers: 156000, topics: ["fitness"] },
    ],
    minBudgetCents: 40000,
  },
  {
    email: "glowwithsam@example.com",
    name: "Sam Iyer",
    bio: "Indie beauty chemist. Ingredient breakdowns, honest reviews, shelf tours.",
    niches: ["beauty", "lifestyle"],
    channels: [
      { platform: "instagram", handle: "glowwithsam", followers: 128000, topics: ["beauty", "lifestyle"] },
      { platform: "youtube", handle: "@GlowWithSam", followers: 240000, topics: ["beauty", "education"] },
    ],
    minBudgetCents: 90000,
  },
  {
    email: "pixelpaula@example.com",
    name: "Paula Kim",
    bio: "Cozy games, handheld setups, and peripheral deep dives.",
    niches: ["gaming", "tech"],
    channels: [
      { platform: "twitch", handle: "pixelpaula", followers: 33000, topics: ["gaming"] },
      { platform: "youtube", handle: "@PixelPaula", followers: 78000, topics: ["gaming", "tech"] },
      { platform: "x", handle: "pixelpaula", followers: 21000, topics: ["gaming", "tech"] },
    ],
    minBudgetCents: 35000,
  },
  {
    email: "chefrio@example.com",
    name: "Rio Alvarez",
    bio: "Street food recreated at home. 60-second recipes with real technique.",
    niches: ["food", "travel"],
    channels: [
      { platform: "tiktok", handle: "chefrio", followers: 410000, topics: ["food", "travel"] },
      { platform: "instagram", handle: "chefrio.eats", followers: 190000, topics: ["food"] },
      { platform: "facebook", handle: "ChefRioKitchen", followers: 88000, topics: ["food"] },
    ],
    minBudgetCents: 120000,
  },
  {
    email: "frugalfox@example.com",
    name: "Dana Osei",
    bio: "Personal finance for first-gen professionals. Budgets, investing, honesty.",
    niches: ["finance", "education"],
    channels: [
      { platform: "youtube", handle: "@FrugalFox", followers: 310000, topics: ["finance", "education"] },
      { platform: "instagram", handle: "frugalfox.money", followers: 64000, topics: ["finance"] },
    ],
    minBudgetCents: 150000,
  },
  {
    email: "wanderjules@example.com",
    name: "Jules Moreau",
    bio: "Slow travel, rail routes, and packing systems that actually work.",
    niches: ["travel", "lifestyle"],
    channels: [
      { platform: "instagram", handle: "wander.jules", followers: 85000, topics: ["travel", "lifestyle"] },
      { platform: "tiktok", handle: "wanderjules", followers: 132000, topics: ["travel"] },
    ],
    minBudgetCents: 50000,
  },
];

function seedCreators() {
  return DEMO_CREATORS.map((seed, index) => ({
    id: randomUUID(),
    role: "creator",
    email: seed.email,
    password_hash: null, // demo roster; claimable via signup with same email
    company: null,
    name: seed.name,
    bio: seed.bio,
    niches: seed.niches,
    channels: seed.channels,
    minBudgetCents: seed.minBudgetCents,
    created_at: new Date(Date.now() - index * 86400000).toISOString(),
  }));
}

export function createMemoryStore() {
  const profiles = new Map();
  const sessions = new Map();
  const campaigns = new Map();
  const applications = new Map();
  const assignments = new Map();
  const ledger = [];
  const leads = [];

  for (const creator of seedCreators()) {
    profiles.set(creator.id, creator);
  }

  function listProfilesByRole(role) {
    return [...profiles.values()].filter((p) => p.role === role);
  }

  return {
    driver: "memory",

    // --- profiles ---
    async createProfile(profile) {
      const record = { ...profile, id: profile.id || randomUUID(), created_at: new Date().toISOString() };
      profiles.set(record.id, record);
      return structuredClone(record);
    },
    async getProfileByEmail(email) {
      const found = [...profiles.values()].find(
        (p) => p.email.toLowerCase() === String(email).toLowerCase(),
      );
      return found ? structuredClone(found) : null;
    },
    async getProfile(id) {
      const found = profiles.get(id);
      return found ? structuredClone(found) : null;
    },
    async updateProfile(id, patch) {
      const existing = profiles.get(id);
      if (!existing) return null;
      const updated = { ...existing, ...patch, id };
      profiles.set(id, updated);
      return structuredClone(updated);
    },
    async listCreatorDirectory(filters = {}) {
      let creators = listProfilesByRole("creator");
      if (filters.platform) {
        creators = creators.filter((c) =>
          (c.channels || []).some((ch) => ch.platform === filters.platform),
        );
      }
      if (filters.niche) {
        creators = creators.filter(
          (c) => (c.niches || []).includes(filters.niche),
        );
      }
      if (filters.minFollowers != null) {
        creators = creators.filter((c) =>
          Math.max(0, ...(c.channels || []).map((ch) => ch.followers)) >= filters.minFollowers,
        );
      }
      if (filters.maxFollowers != null) {
        creators = creators.filter((c) =>
          Math.max(0, ...(c.channels || []).map((ch) => ch.followers)) <= filters.maxFollowers,
        );
      }
      if (filters.maxBudgetCents != null) {
        creators = creators.filter(
          (c) => (c.minBudgetCents ?? 0) <= filters.maxBudgetCents,
        );
      }
      return structuredClone(creators);
    },

    // --- sessions ---
    async createSession(session) {
      sessions.set(session.token, structuredClone(session));
      return structuredClone(session);
    },
    async getSession(token) {
      const found = sessions.get(token);
      return found ? structuredClone(found) : null;
    },
    async deleteSession(token) {
      sessions.delete(token);
    },

    // --- campaigns ---
    async insertCampaign(campaign) {
      const record = {
        ...campaign,
        id: campaign.id || randomUUID(),
        created_at: campaign.created_at || new Date().toISOString(),
      };
      campaigns.set(record.id, structuredClone(record));
      return structuredClone(record);
    },
    async getCampaign(id) {
      const found = campaigns.get(id);
      return found ? structuredClone(found) : null;
    },
    async updateCampaign(id, patch) {
      const existing = campaigns.get(id);
      if (!existing) return null;
      const updated = { ...existing, ...patch, id };
      campaigns.set(id, updated);
      return structuredClone(updated);
    },
    async claimCampaignFunding(id, claimRef) {
      const campaign = campaigns.get(id);
      if (
        campaign?.status === "open" &&
        campaign.payment_status === "unpaid" &&
        campaign.slots_remaining === 0 &&
        (campaign.payment_ref == null || campaign.payment_ref === claimRef)
      ) {
        campaign.payment_ref = claimRef;
        campaigns.set(id, campaign);
        return structuredClone(campaign);
      }
      return null;
    },
    async releaseCampaignFundingClaim(id, claimRef) {
      const campaign = campaigns.get(id);
      if (
        campaign?.status === "open" &&
        campaign.payment_status === "unpaid" &&
        campaign.payment_ref === claimRef
      ) {
        campaign.payment_ref = null;
        campaigns.set(id, campaign);
      }
    },
    async finalizeCampaignFunding({
      campaignId,
      claimRef,
      providerRef,
      fundedAt,
      charge,
      fee,
    }) {
      const campaign = campaigns.get(campaignId);
      if (
        !campaign ||
        campaign.status !== "open" ||
        campaign.payment_status !== "unpaid" ||
        campaign.payment_ref !== claimRef
      ) {
        throw new Error("Campaign funding transaction did not finalize.");
      }
      const updated = {
        ...campaign,
        status: "funded",
        payment_status: "held",
        funded_at: fundedAt,
        payment_ref: providerRef,
      };
      campaigns.set(campaignId, updated);
      await this.appendLedger(charge);
      await this.appendLedger(fee);
      return structuredClone(updated);
    },
    async listCampaigns({ brandId } = {}) {
      let rows = [...campaigns.values()];
      if (brandId) rows = rows.filter((c) => c.brand_id === brandId);
      return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
    },

    // --- applications ---
    async insertApplication(application) {
      const record = {
        ...application,
        id: application.id || randomUUID(),
        created_at: application.created_at || new Date().toISOString(),
      };
      applications.set(record.id, structuredClone(record));
      return structuredClone(record);
    },
    async getApplication(id) {
      const found = applications.get(id);
      return found ? structuredClone(found) : null;
    },
    async updateApplication(id, patch) {
      const existing = applications.get(id);
      if (!existing) return null;
      const updated = { ...existing, ...patch, id };
      applications.set(id, updated);
      return structuredClone(updated);
    },
    async declineApplication(id, decidedAt) {
      const existing = applications.get(id);
      if (!existing || existing.status !== "pending") return null;
      const updated = {
        ...existing,
        status: "declined",
        decided_at: decidedAt,
      };
      applications.set(id, updated);
      return structuredClone(updated);
    },
    async findApplication(campaignId, creatorId) {
      const found = [...applications.values()].find(
        (a) => a.campaign_id === campaignId && a.creator_id === creatorId,
      );
      return found ? structuredClone(found) : null;
    },
    async listApplications({ campaignId, creatorId } = {}) {
      let rows = [...applications.values()];
      if (campaignId) rows = rows.filter((a) => a.campaign_id === campaignId);
      if (creatorId) rows = rows.filter((a) => a.creator_id === creatorId);
      return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
    },

    async acceptApplication(result) {
      const currentCampaign = campaigns.get(result.campaign.id);
      const currentApplication = applications.get(result.application.id);
      const duplicateAssignment = [...assignments.values()].some(
        (assignment) =>
          assignment.campaign_id === result.campaign.id &&
          assignment.creator_id === result.assignment.creator_id,
      );
      if (
        !currentCampaign ||
        currentCampaign.status !== "open" ||
        currentCampaign.payment_status !== "unpaid" ||
        currentCampaign.slots_remaining <= 0 ||
        !currentApplication ||
        currentApplication.status !== "pending" ||
        currentApplication.campaign_id !== currentCampaign.id ||
        currentApplication.creator_id !== result.assignment.creator_id ||
        duplicateAssignment
      ) {
        const error = new Error("Application can no longer be accepted.");
        error.statusCode = 409;
        throw error;
      }

      const campaign = {
        ...currentCampaign,
        slots_remaining: currentCampaign.slots_remaining - 1,
      };
      const application = {
        ...currentApplication,
        status: "accepted",
        decided_at: result.application.decided_at,
      };
      const assignment = {
        ...result.assignment,
        id: result.assignment.id || randomUUID(),
        created_at: result.assignment.created_at || new Date().toISOString(),
      };
      campaigns.set(campaign.id, campaign);
      applications.set(application.id, application);
      assignments.set(assignment.id, assignment);
      return {
        campaign: structuredClone(campaign),
        application: structuredClone(application),
        assignment: structuredClone(assignment),
      };
    },

    // --- assignments ---
    async insertAssignment(assignment) {
      const record = {
        ...assignment,
        id: assignment.id || randomUUID(),
        created_at: assignment.created_at || new Date().toISOString(),
      };
      assignments.set(record.id, structuredClone(record));
      return structuredClone(record);
    },
    async getAssignment(id) {
      const found = assignments.get(id);
      return found ? structuredClone(found) : null;
    },
    async updateAssignment(id, patch) {
      const existing = assignments.get(id);
      if (!existing) return null;
      const updated = { ...existing, ...patch, id };
      assignments.set(id, updated);
      return structuredClone(updated);
    },
    async claimAssignmentApproval(id, { reviewedAt, notes }) {
      const existing = assignments.get(id);
      if (!existing || existing.status !== "submitted") return null;
      const updated = {
        ...existing,
        status: "approved",
        reviewed_at: reviewedAt,
        notes: notes ?? null,
      };
      assignments.set(id, updated);
      return structuredClone(updated);
    },
    async rejectAssignment(id, { reviewedAt, notes }) {
      const existing = assignments.get(id);
      if (!existing || existing.status !== "submitted") return null;
      const updated = {
        ...existing,
        status: "rejected",
        reviewed_at: reviewedAt,
        notes: notes ?? null,
      };
      assignments.set(id, updated);
      return structuredClone(updated);
    },
    async finalizeAssignmentPayout({
      assignmentId,
      campaignId,
      providerRef,
      paidAt,
      notes,
      ledgerEntry,
    }) {
      const assignment = assignments.get(assignmentId);
      if (!assignment || assignment.status !== "approved") {
        throw new Error("Creator payout transaction did not finalize.");
      }
      const paid = {
        ...assignment,
        status: "paid",
        paid_at: paidAt,
        payout_ref: providerRef,
        notes: notes ?? null,
      };
      assignments.set(assignmentId, paid);
      await this.appendLedger(ledgerEntry);

      const campaign = campaigns.get(campaignId);
      const campaignAssignments = [...assignments.values()].filter(
        (item) => item.campaign_id === campaignId,
      );
      if (
        campaign?.status === "funded" &&
        campaignAssignments.length === campaign.slots &&
        campaignAssignments.every((item) =>
          ["paid", "declined"].includes(item.status),
        )
      ) {
        campaigns.set(campaignId, {
          ...campaign,
          status: "completed",
          payment_status: "settled",
        });
      }
      return structuredClone(paid);
    },
    async listAssignments({ campaignId, creatorId } = {}) {
      let rows = [...assignments.values()];
      if (campaignId) rows = rows.filter((a) => a.campaign_id === campaignId);
      if (creatorId) rows = rows.filter((a) => a.creator_id === creatorId);
      return rows;
    },

    // --- ledger ---
    async appendLedger(entry) {
      const existing = entry.operation_key
        ? ledger.find((item) => item.operation_key === entry.operation_key)
        : null;
      if (existing) {
        assertSameLedgerOperation(existing, entry);
        return structuredClone(existing);
      }
      const row = { id: entry.id || randomUUID(), ...structuredClone(entry) };
      ledger.push(row);
      return structuredClone(row);
    },
    async listLedger({ campaignId } = {}) {
      return ledger
        .filter((e) => !campaignId || e.campaign_id === campaignId)
        .map((e) => ({ ...e }));
    },

    // --- leads ---
    async insertLead(lead) {
      leads.push(structuredClone(lead));
      return lead;
    },
  };
}

function assertSameLedgerOperation(stored, expected) {
  if (
    stored.campaign_id !== expected.campaign_id ||
    (stored.assignment_id ?? null) !== (expected.assignment_id ?? null) ||
    stored.kind !== expected.kind ||
    stored.amount_cents !== expected.amount_cents ||
    (stored.provider_ref ?? null) !== (expected.provider_ref ?? null)
  ) {
    throw new Error("Ledger idempotency key was reused with different payment data.");
  }
}
