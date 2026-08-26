import { createMemoryStore } from "./memory-store.js";
import { createSupabaseStore, hasSupabaseConfig } from "./supabase-store.js";

// Single store instance per server process. Supabase Postgres or D1 when
// configured (production), seeded in-memory store otherwise (local dev/demo).
// The D1 binding is resolved lazily inside the store on first query, so no
// request-context work happens at module init.
let store;

if (!globalThis.__influenceMarketStore) {
  globalThis.__influenceMarketStore = hasSupabaseConfig()
    ? createSupabaseStore()
    : createMemoryStore();
}
store = globalThis.__influenceMarketStore;

export function getStore() {
  return store;
}

export function storeMode() {
  return store.driver;
}
