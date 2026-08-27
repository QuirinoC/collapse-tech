import { createMemoryStore } from "./memory-store.js";
import { createSupabaseStore, hasSupabaseConfig } from "./supabase-store.js";

// The production store is created per access so Worker binding changes are
// observed without a stale, global client. The demo store intentionally lasts
// for one local process.
let memoryStore;

export function getStore() {
  if (hasSupabaseConfig()) return createSupabaseStore();
  if (process.env.NODE_ENV === "production") {
    throw new Error("Production persistence must be configured.");
  }
  memoryStore ??= createMemoryStore();
  return memoryStore;
}

export function storeMode() {
  return getStore().driver;
}
