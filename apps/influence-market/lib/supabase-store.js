// Supabase/D1-backed store. Mirrors the memory store interface exactly; the
// repository picks between them based on environment configuration.
// Two backends:
//   - Cloudflare D1 via the native DB binding declared in wrangler.jsonc,
//     resolved lazily through @opennextjs/cloudflare on first query.
//   - Supabase Postgres via supabase-js (NEXT_PUBLIC_SUPABASE_URL + service
//     key), kept as an alternative managed-Postgres option.
// SUPABASE_QUERY_ENDPOINT doubles as a deploy-time flag that persistence is
// enabled even before the D1 binding becomes reachable mid-request.

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

let client = null;
let d1Binding = null;
let d1ResolveAttempt = false;

export function setD1Binding(binding) {
  d1Binding = binding ?? null;
}

export function hasSupabaseConfig() {
  return Boolean(
    process.env.SUPABASE_QUERY_ENDPOINT ||
      (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
  );
}

const d1Mode = () =>
  Boolean(d1Binding) || Boolean(process.env.SUPABASE_QUERY_ENDPOINT);

async function resolveD1Binding() {
  if (d1Binding || d1ResolveAttempt) return d1Binding;
  d1ResolveAttempt = true;
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    d1Binding = getCloudflareContext().env?.DB ?? null;
  } catch {
    // Not running inside the OpenNext Cloudflare worker (e.g. local Node).
  }
  return d1Binding;
}

async function d1(sql, params = []) {
  const binding = await resolveD1Binding();
  if (!binding) {
    throw new Error("D1 binding is not available in this environment.");
  }
  const { results, success, error } = await binding
    .prepare(sql)
    .bind(...params)
    .all();
  if (!success) throw new Error(error ?? "D1 query failed.");
  return results || [];
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
  const parse = (value) => {
    if (!value) return [];
    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch {
        return [];
      }
    }
    return value;
  };
  return {
    id: row.id,
    role: row.role,
    email: row.email,
    password_hash: row.password_hash,
    company: row.company,
    name: row.name,
    bio: row.bio,
    niches: parse(row.niches),
    channels: parse(row.channels),
    minBudgetCents: row.min_budget_cents ?? null,
    created_at: row.created_at,
  };
}

export function createSupabaseStore() {
  const table = (name) => db().from(name);

  return {
    driver: "supabase",

    async createProfile(profile) {
      if (d1Mode()) {
        const out = await d1(
          `insert into profiles (id, role, email, password_hash, company, name, bio, niches, channels, min_budget_cents)
           values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) returning *`,
          [
            profile.id || randomUUID(),
            profile.role,
            profile.email.toLowerCase(),
            profile.password_hash,
            profile.company ?? null,
            profile.name,
            profile.bio ?? null,
            JSON.stringify(profile.niches ?? []),
            JSON.stringify(profile.channels ?? []),
            profile.minBudgetCents ?? null,
          ],
        );
        return mapProfile(out[0]);
      }
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
      if (d1Mode()) {
        return mapProfile(
          (
            await d1("select * from profiles where email = ? limit 1", [
              String(email).toLowerCase(),
            ])
          )[0] ?? null,
        );
      }
      const { data } = await table("profiles")
        .eq("email", String(email).toLowerCase())
        .maybeSingle();
      return mapProfile(data);
    },
    async getProfile(id) {
      if (d1Mode()) {
        return mapProfile((await d1("select * from profiles where id = ? limit 1", [id]))[0] ?? null);
      }
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
      if (d1Mode()) {
        const entries = Object.entries(update);
        if (!entries.length) return this.getProfile(id);
        const sets = [];
        const params = [];
        for (const [key, value] of entries) {
          sets.push(`${key} = ?`);
          params.push(
            key === "niches" || key === "channels" ? JSON.stringify(value) : value,
          );
        }
        return mapProfile(
          (await d1(`update profiles set ${sets.join(", ")} where id = ? returning *`, [...params, id]))[0] ??
            null,
        );
      }
      const { data, error } = await table("profiles")
        .update(update)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return mapProfile(data);
    },
    async listCreatorDirectory(filters = {}) {
      if (d1Mode()) {
        let creators = (await d1("select * from profiles where role = 'creator' order by created_at desc")).map(mapProfile);
        if (filters.niche) {
          creators = creators.filter((c) => (c.niches || []).includes(filters.niche));
        }
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
      }
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
      if (d1Mode()) {
        await d1(
          "insert into sessions (token, profile_id, expires_at) values (?, ?, ?)",
          [session.token, session.profile_id, session.expires_at ?? null],
        );
        return session;
      }
      const { error } = await table("sessions").insert({
        token: session.token,
        profile_id: session.profile_id,
        expires_at: session.expires_at,
      });
      if (error) throw error;
      return session;
    },
    async getSession(token) {
      if (d1Mode()) {
        return (
          (await d1("select * from sessions where token = ? limit 1", [token]))[0] ?? null
        );
      }
      const { data, error } = await table("sessions")
        .select("*")
        .eq("token", token)
        .maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      return data || null;
    },
    async deleteSession(token) {
      if (d1Mode()) {
        await d1("delete from sessions where token = ?", [token]);
        return;
      }
      await table("sessions").delete().eq("token", token);
    },

    async insertCampaign(campaign) {
      if (d1Mode()) {
        const out = await d1(
          `insert into campaigns (id, brand_id, title, brief, product_info, platforms, niches,
             demographics, follower_min, follower_max, slots, slots_remaining, budget_cents,
             fee_cents, per_creator_cents, status, payment_status, payment_ref, funded_at)
           values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) returning *`,
          [
            campaign.id || randomUUID(),
            campaign.brand_id,
            campaign.title,
            campaign.brief,
            campaign.product_info ?? null,
            JSON.stringify(campaign.platforms),
            JSON.stringify(campaign.niches),
            campaign.demographics ?? null,
            campaign.follower_min ?? null,
            campaign.follower_max ?? null,
            campaign.slots,
            campaign.slots_remaining,
            campaign.budget_cents,
            campaign.fee_cents,
            campaign.per_creator_cents,
            campaign.status,
            campaign.payment_status,
            campaign.payment_ref ?? null,
            campaign.funded_at ?? null,
          ],
        );
        return out[0];
      }
      const { data, error } = await table("campaigns").insert(campaign).select().single();
      if (error) throw error;
      return data;
    },
    async getCampaign(id) {
      if (d1Mode()) {
        const row = (await d1("select * from campaigns where id = ? limit 1", [id]))[0];
        if (!row) return null;
        return {
          ...row,
          platforms: JSON.parse(row.platforms || "[]"),
          niches: JSON.parse(row.niches || "[]"),
        };
      }
      const { data } = await table("campaigns").eq("id", id).maybeSingle();
      return data || null;
    },
    async updateCampaign(id, patch) {
      if (d1Mode()) {
        const sets = [];
        const params = [];
        for (const [key, value] of Object.entries(patch)) {
          sets.push(`${key} = ?`);
          params.push(
            key === "platforms" || key === "niches" ? JSON.stringify(value) : value,
          );
        }
        const out = await d1(
          `update campaigns set ${sets.join(", ")} where id = ? returning *`,
          [...params, id],
        );
        const row = out[0];
        return row && {
          ...row,
          platforms: JSON.parse(row.platforms || "[]"),
          niches: JSON.parse(row.niches || "[]"),
        };
      }
      const { data, error } = await table("campaigns")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    async listCampaigns({ brandId } = {}) {
      let list;
      if (d1Mode()) {
        list = brandId
          ? await d1("select * from campaigns where brand_id = ? order by created_at desc", [brandId])
          : await d1("select * from campaigns order by created_at desc");
        list = list.map((row) => ({
          ...row,
          platforms: JSON.parse(row.platforms || "[]"),
          niches: JSON.parse(row.niches || "[]"),
        }));
        return list;
      }
      let query = table("campaigns").order("created_at", { ascending: false });
      if (brandId) query = query.eq("brand_id", brandId);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },

    async insertApplication(application) {
      if (d1Mode()) {
        const out = await d1(
          `insert into applications (id, campaign_id, creator_id, pitch, status, decided_at)
           values (?, ?, ?, ?, ?, ?) returning *`,
          [
            application.id || randomUUID(),
            application.campaign_id,
            application.creator_id,
            application.pitch,
            application.status,
            application.decided_at ?? null,
          ],
        );
        return out[0];
      }
      const { data, error } = await table("applications")
        .insert(application)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    async getApplication(id) {
      if (d1Mode()) {
        return (await d1("select * from applications where id = ? limit 1", [id]))[0] ?? null;
      }
      const { data } = await table("applications").eq("id", id).maybeSingle();
      return data || null;
    },
    async updateApplication(id, patch) {
      if (d1Mode()) {
        const sets = [];
        const params = [];
        for (const [key, value] of Object.entries(patch)) {
          sets.push(`${key} = ?`);
          params.push(value);
        }
        return (
          (
            await d1(
              `update applications set ${sets.join(", ")} where id = ? returning *`,
              [...params, id],
            )
          )[0] ?? null
        );
      }
      const { data, error } = await table("applications")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    async findApplication(campaignId, creatorId) {
      if (d1Mode()) {
        return (
          (
            await d1(
              "select * from applications where campaign_id = ? and creator_id = ? limit 1",
              [campaignId, creatorId],
            )
          )[0] ?? null
        );
      }
      const { data } = await table("applications")
        .eq("campaign_id", campaignId)
        .eq("creator_id", creatorId)
        .maybeSingle();
      return data || null;
    },
    async listApplications({ campaignId, creatorId } = {}) {
      if (d1Mode()) {
        let list;
        if (campaignId && creatorId) {
          list = await d1(
            "select * from applications where campaign_id = ? and creator_id = ? order by created_at desc",
            [campaignId, creatorId],
          );
        } else if (campaignId) {
          list = await d1("select * from applications where campaign_id = ? order by created_at desc", [campaignId]);
        } else if (creatorId) {
          list = await d1("select * from applications where creator_id = ? order by created_at desc", [creatorId]);
        } else {
          list = await d1("select * from applications order by created_at desc");
        }
        return list;
      }
      let query = table("applications").order("created_at", { ascending: false });
      if (campaignId) query = query.eq("campaign_id", campaignId);
      if (creatorId) query = query.eq("creator_id", creatorId);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },

    async insertAssignment(assignment) {
      if (d1Mode()) {
        const out = await d1(
          `insert into assignments (id, campaign_id, creator_id, status, content_url,
             submitted_at, reviewed_at, paid_at, payout_ref)
           values (?, ?, ?, ?, ?, ?, ?, ?, ?) returning *`,
          [
            assignment.id || randomUUID(),
            assignment.campaign_id,
            assignment.creator_id,
            assignment.status,
            assignment.content_url ?? null,
            assignment.submitted_at ?? null,
            assignment.reviewed_at ?? null,
            assignment.paid_at ?? null,
            assignment.payout_ref ?? null,
          ],
        );
        return out[0];
      }
      const { data, error } = await table("assignments")
        .insert(assignment)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    async getAssignment(id) {
      if (d1Mode()) {
        return (await d1("select * from assignments where id = ? limit 1", [id]))[0] ?? null;
      }
      const { data } = await table("assignments").eq("id", id).maybeSingle();
      return data || null;
    },
    async updateAssignment(id, patch) {
      if (d1Mode()) {
        const entries = Object.entries(patch);
        if (!entries.length) return this.getAssignment(id);
        const sets = ["updated_at = datetime('now')"];
        const params = [];
        for (const [key, value] of entries) {
          sets.push(`${key} = ?`);
          params.push(value);
        }
        return (
          (
            await d1(
              `update assignments set ${sets.join(", ")} where id = ? returning *`,
              [...params, id],
            )
          )[0] ?? null
        );
      }
      const { data, error } = await table("assignments")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    async listAssignments({ campaignId, creatorId } = {}) {
      if (d1Mode()) {
        let list;
        if (campaignId && creatorId) {
          list = await d1("select * from assignments where campaign_id = ? and creator_id = ?", [campaignId, creatorId]);
        } else if (campaignId) {
          list = await d1("select * from assignments where campaign_id = ?", [campaignId]);
        } else if (creatorId) {
          list = await d1("select * from assignments where creator_id = ?", [creatorId]);
        } else {
          list = await d1("select * from assignments");
        }
        return list;
      }
      let query = table("assignments");
      if (campaignId) query = query.eq("campaign_id", campaignId);
      if (creatorId) query = query.eq("creator_id", creatorId);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },

    async appendLedger(entry) {
      if (d1Mode()) {
        await d1(
          `insert into ledger_entries (id, campaign_id, assignment_id, kind, amount_cents, provider_ref, memo)
           values (?, ?, ?, ?, ?, ?, ?)`,
          [
            entry.id || randomUUID(),
            entry.campaign_id,
            entry.assignment_id ?? null,
            entry.kind,
            entry.amount_cents,
            entry.provider_ref ?? null,
            entry.memo ?? null,
          ],
        );
        return entry;
      }
      const { error } = await table("ledger_entries").insert(entry);
      if (error) throw error;
      return entry;
    },
    async listLedger({ campaignId } = {}) {
      if (d1Mode()) {
        return campaignId
          ? await d1("select * from ledger_entries where campaign_id = ?", [campaignId])
          : await d1("select * from ledger_entries");
      }
      let query = table("ledger_entries");
      if (campaignId) query = query.eq("campaign_id", campaignId);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },

    async insertLead(lead) {
      if (d1Mode()) {
        await d1(
          "insert into leads (id, name, email, kind, message) values (?, ?, ?, ?, ?)",
          [lead.id || randomUUID(), lead.name, lead.email, lead.kind, lead.message],
        );
        return lead;
      }
      const { error } = await table("leads").insert(lead);
      if (error) throw error;
      return lead;
    },
  };
}
