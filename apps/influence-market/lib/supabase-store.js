// Supabase-backed store. Mirrors the memory store interface exactly; the
// repository picks between them based on env configuration.

import { createClient } from "@supabase/supabase-js";

let client = null;

export function hasSupabaseConfig() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

function db() {
  if (!hasSupabaseConfig()) {
    throw new Error("Supabase credentials are not configured.");
  }
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  }
  return client;
}

function mapProfile(row) {
  if (!row) return null;
  return {
    id: row.id,
    role: row.role,
    email: row.email,
    password_hash: row.password_hash,
    company: row.company,
    name: row.name,
    bio: row.bio,
    niches: row.niches || [],
    channels: row.channels || [],
    minBudgetCents: row.min_budget_cents ?? null,
    created_at: row.created_at,
  };
}

export function createSupabaseStore() {
  const table = (name) => db().from(name);

  return {
    driver: "supabase",

    async createProfile(profile) {
      const { data, error } = await table("profiles")
        .insert({
          id: profile.id,
          role: profile.role,
          email: profile.email.toLowerCase(),
          password_hash: profile.password_hash,
          company: profile.company ?? null,
          name: profile.name,
          bio: profile.bio ?? null,
          niches: profile.niches ?? [],
          channels: profile.channels ?? [],
          min_budget_cents: profile.minBudgetCents ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return mapProfile(data);
    },
    async getProfileByEmail(email) {
      const { data } = await table("profiles")
        .eq("email", String(email).toLowerCase())
        .maybeSingle();
      return mapProfile(data);
    },
    async getProfile(id) {
      const { data } = await table("profiles").eq("id", id).maybeSingle();
      return mapProfile(data);
    },
    async updateProfile(id, patch) {
      const update = {};
      if ("bio" in patch) update.bio = patch.bio;
      if ("niches" in patch) update.niches = patch.niches;
      if ("channels" in patch) update.channels = patch.channels;
      if ("minBudgetCents" in patch) update.min_budget_cents = patch.minBudgetCents;
      if ("password_hash" in patch) update.password_hash = patch.password_hash;
      const { data, error } = await table("profiles")
        .update(update)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return mapProfile(data);
    },
    async listCreatorDirectory(filters = {}) {
      let query = table("profiles").eq("role", "creator");
      if (filters.niche) query = query.contains("niches", [filters.niche]);
      const { data, error } = await query;
      if (error) throw error;
      let creators = (data || []).map(mapProfile);
      if (filters.platform) {
        creators = creators.filter((c) =>
          (c.channels || []).some((ch) => ch.platform === filters.platform),
        );
      }
      const maxOf = (c) => Math.max(0, ...(c.channels || []).map((ch) => ch.followers));
      if (filters.minFollowers != null) creators = creators.filter((c) => maxOf(c) >= filters.minFollowers);
      if (filters.maxFollowers != null) creators = creators.filter((c) => maxOf(c) <= filters.maxFollowers);
      if (filters.maxBudgetCents != null) {
        creators = creators.filter((c) => (c.minBudgetCents ?? 0) <= filters.maxBudgetCents);
      }
      return creators;
    },

    async createSession(session) {
      const { error } = await table("sessions").insert({
        token: session.token,
        profile_id: session.profile_id,
        expires_at: session.expires_at,
      });
      if (error) throw error;
      return session;
    },
    async getSession(token) {
      const { data, error } = await table("sessions")
        .select("*")
        .eq("token", token)
        .maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      return data || null;
    },
    async deleteSession(token) {
      await table("sessions").delete().eq("token", token);
    },

    async insertCampaign(campaign) {
      const { data, error } = await table("campaigns").insert(campaign).select().single();
      if (error) throw error;
      return data;
    },
    async getCampaign(id) {
      const { data } = await table("campaigns").eq("id", id).maybeSingle();
      return data || null;
    },
    async updateCampaign(id, patch) {
      const { data, error } = await table("campaigns")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    async listCampaigns({ brandId } = {}) {
      let query = table("campaigns").order("created_at", { ascending: false });
      if (brandId) query = query.eq("brand_id", brandId);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },

    async insertApplication(application) {
      const { data, error } = await table("applications")
        .insert(application)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    async getApplication(id) {
      const { data } = await table("applications").eq("id", id).maybeSingle();
      return data || null;
    },
    async updateApplication(id, patch) {
      const { data, error } = await table("applications")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    async findApplication(campaignId, creatorId) {
      const { data } = await table("applications")
        .eq("campaign_id", campaignId)
        .eq("creator_id", creatorId)
        .maybeSingle();
      return data || null;
    },
    async listApplications({ campaignId, creatorId } = {}) {
      let query = table("applications").order("created_at", { ascending: false });
      if (campaignId) query = query.eq("campaign_id", campaignId);
      if (creatorId) query = query.eq("creator_id", creatorId);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },

    async insertAssignment(assignment) {
      const { data, error } = await table("assignments")
        .insert(assignment)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    async getAssignment(id) {
      const { data } = await table("assignments").eq("id", id).maybeSingle();
      return data || null;
    },
    async updateAssignment(id, patch) {
      const { data, error } = await table("assignments")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    async listAssignments({ campaignId, creatorId } = {}) {
      let query = table("assignments");
      if (campaignId) query = query.eq("campaign_id", campaignId);
      if (creatorId) query = query.eq("creator_id", creatorId);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },

    async appendLedger(entry) {
      const { error } = await table("ledger_entries").insert(entry);
      if (error) throw error;
      return entry;
    },
    async listLedger({ campaignId } = {}) {
      let query = table("ledger_entries");
      if (campaignId) query = query.eq("campaign_id", campaignId);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },

    async insertLead(lead) {
      const { error } = await table("leads").insert(lead);
      if (error) throw error;
      return lead;
    },
  };
}
