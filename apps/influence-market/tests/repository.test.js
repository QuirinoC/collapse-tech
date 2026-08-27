import { test } from "node:test";
import assert from "node:assert/strict";
import { getStore } from "../lib/repository.js";

test("production refuses the ephemeral demo store", () => {
  const original = {
    nodeEnv: process.env.NODE_ENV,
    persistenceDriver: process.env.PERSISTENCE_DRIVER,
    supabaseQueryEndpoint: process.env.SUPABASE_QUERY_ENDPOINT,
    supabaseUrl: process.env.SUPABASE_URL,
    publicSupabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  process.env.NODE_ENV = "production";
  delete process.env.PERSISTENCE_DRIVER;
  delete process.env.SUPABASE_QUERY_ENDPOINT;
  delete process.env.SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    assert.throws(() => getStore(), /persistence must be configured/i);
  } finally {
    restoreEnvironment("NODE_ENV", original.nodeEnv);
    restoreEnvironment("PERSISTENCE_DRIVER", original.persistenceDriver);
    restoreEnvironment("SUPABASE_QUERY_ENDPOINT", original.supabaseQueryEndpoint);
    restoreEnvironment("SUPABASE_URL", original.supabaseUrl);
    restoreEnvironment("NEXT_PUBLIC_SUPABASE_URL", original.publicSupabaseUrl);
    restoreEnvironment("SUPABASE_SERVICE_ROLE_KEY", original.serviceRoleKey);
  }
});

function restoreEnvironment(key, value) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
