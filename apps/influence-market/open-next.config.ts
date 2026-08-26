import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({
  // Marketing pages are static; API routes hit Supabase/Stripe over HTTPS.
  incrementalCache: undefined,
});
