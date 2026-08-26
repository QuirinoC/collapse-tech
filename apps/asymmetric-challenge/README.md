# Asymmetric Challenge

256-bit key challenge experiment: guess enough key material to claim a prize.
Built to explore proof-of-work style commitments with real money at stake.

**Live:** https://challenge.collapsetechnologies.com

## How it works

A secret 256-bit key (`SECRET_KEY_HEX`) generates public commitment hashes.
Players submit guesses; the app checks them against the commitment and records
attempts in Postgres (Supabase). Changing the secret rotates all challenge IDs
and invalidates existing guesses — see "Local Secret Rotation" in
[DEPLOYMENT.md](./DEPLOYMENT.md).

## Stack

- Next.js on Cloudflare Workers via `@opennextjs/cloudflare`
  (`open-next.config.ts` + `wrangler.jsonc`, `nodejs_compat` flag)
- Supabase Postgres (schema in `supabase/schema.sql`)
- Playwright E2E tests (`npm run test:e2e`), node test runner for units

## Local development

```bash
npm install --legacy-peer-deps   # adapter peer-wants next >= 16.2.11
SECRET_KEY_HEX=$(openssl rand -hex 32) DATABASE_URL=... npm run dev
```

From repo root: `npm run dev:challenge`.

## Build & deploy

Deployment details (secrets, Supabase setup, rotation) live in
[DEPLOYMENT.md](./DEPLOYMENT.md). Short version:

```bash
SECRET_KEY_HEX=$(openssl rand -hex 32) npx opennextjs-cloudflare build
npx wrangler deploy
```

Secrets are Worker secrets set via `wrangler secret put`: `SECRET_KEY_HEX`,
`DATABASE_URL` (or `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`). The custom
domain `challenge.collapsetechnologies.com` is bound in `wrangler.jsonc`.
