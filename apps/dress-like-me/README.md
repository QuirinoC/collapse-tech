# Dress Like Me

Dress Like Me turns public Instagram outfit references into structured garment
descriptions and live shopping matches. The MVP includes a curated creator index,
public-post imports, durable processing, and a protected operations queue.

## Local development

```bash
cp .env.example .env.local
npm install
npm run dev
```

The curated experience works without provider credentials. Imports require a
Supabase project, Gemini API key, SearchAPI key, and the Workflow development
runtime configured by the `workflow` package.

Apply `supabase/migrations/001_initial.sql` to the project before enabling
imports. The service-role key is server-only and must never use a
`NEXT_PUBLIC_` prefix.

## Providers and data handling

- **Instagram:** public `/p/` and `/reel/` pages only. No login automation,
  private posts, CAPTCHA bypass, or bulk crawling.
- **Gemini:** garment extraction through structured JSON output. Override the
  default model with `GEMINI_MODEL`.
- **SearchAPI:** Google Shopping result discovery. Replaceable through
  `src/lib/products.js`.
- **Source images:** downloaded into memory for analysis and discarded. The
  app stores the permalink, permitted metadata, garment data, and product
  result snapshot—not source image bytes.

Searches are recorded with salted request fingerprints when configured. Analytics
events contain only aggregate booleans or merchant names, never raw queries,
post URLs, or source images.

## Deployment

Deploy as a Cloudflare Worker via `@opennextjs/cloudflare` (same pattern as
`apps/asymmetric-challenge`: adapter config + `wrangler.jsonc`, build with
`npx opennextjs-cloudflare build`, deploy with `npx wrangler deploy`). Configure
the variables in `.env.example` as Worker secrets. Set
`NEXT_PUBLIC_SITE_URL=https://dresslikeme.collapsetechnologies.com`, then attach
that domain to the Worker.

> **Status:** migration parked — this app is not yet deployed to Cloudflare.

The internal `/admin` page requires `ADMIN_API_TOKEN` and supports reviewing
and retrying failed imports.

## Operations

Failed imports retain error text but never image bytes or secrets. Use `/admin`
to retry transient failures. For a takedown, insert an active record in
`takedowns`, set the associated `source_posts.removed_at`, and set its outfits
to `removed`. Provider adapters are intentionally isolated because source and
shopping access policies can change.
