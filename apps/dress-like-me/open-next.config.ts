import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({
  // App is mostly static pages + API routes hitting Supabase/Gemini over HTTPS.
  incrementalCache: undefined,
});
