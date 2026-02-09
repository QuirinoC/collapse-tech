import { createClient } from "@supabase/supabase-js";

let supabaseClient;

export function isSupabaseConfigured() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  return Boolean(url && key);
}

export function getSupabaseAdmin() {
  if (supabaseClient) return supabaseClient;

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }

  supabaseClient = createClient(url, key, {
    auth: { persistSession: false },
    global: {
      headers: {
        "X-Client-Info": "asymetric-challenge",
      },
    },
  });

  return supabaseClient;
}
