import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({
  // Telemetry/stats/claim routes hit Supabase over HTTPS — no R2/KV incremental cache needed.
  incrementalCache: undefined,
});
