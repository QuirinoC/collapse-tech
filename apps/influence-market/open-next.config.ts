import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({
  // Marketing pages are static; API routes use D1 or the optional Supabase store.
  incrementalCache: undefined,
});
