import { createMemoryStore } from "./memory-store.js";
import { createSupabaseStore, hasSupabaseConfig } from "./supabase-store.js";

// Single store instance per server process. Supabase Postgres when configured
// (production), seeded in-memory store otherwise (local dev / demo).
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
