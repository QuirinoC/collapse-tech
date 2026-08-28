import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({
  // Stats, telemetry, and claims use the native D1 binding — no R2/KV cache.
  incrementalCache: undefined,
});
