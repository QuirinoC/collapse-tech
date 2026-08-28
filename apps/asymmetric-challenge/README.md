# Asymmetric Challenge

256-bit key challenge experiment: guess enough key material to claim a prize.
Built to explore proof-of-work style commitments with real money at stake.

**Live:** https://challenge.collapsetechnologies.com

## How it works

A secret 256-bit key (`SECRET_KEY_HEX`) generates public commitment hashes.
Players submit guesses; the app checks them against the commitment and records
aggregate attempt totals in Cloudflare D1. Changing the secret rotates all
challenge IDs and invalidates existing guesses — see "Local Secret Rotation" in
[DEPLOYMENT.md](./DEPLOYMENT.md).

## Stack

- Next.js on Cloudflare Workers via `@opennextjs/cloudflare`
  (`open-next.config.ts` + `wrangler.jsonc`, `nodejs_compat` flag)
- Cloudflare D1 (schema in `d1/migrations/`)
- Playwright E2E tests (`npm run test:e2e`), node test runner for units

## Local development

```bash
npm install --legacy-peer-deps   # adapter peer-wants next >= 16.2.11
SECRET_KEY_HEX=$(openssl rand -hex 32) npm run dev
```

API routes need the D1 binding, so stats/claim/telemetry against a real database
use Wrangler:

```bash
npx wrangler d1 migrations apply asymmetric-challenge --local
SECRET_KEY_HEX=$(openssl rand -hex 32) npx opennextjs-cloudflare build
npx wrangler dev
```

From repo root: `npm run dev:challenge`.

## Build & deploy

Deployment details (D1 migrations, secrets, rotation) live in
[DEPLOYMENT.md](./DEPLOYMENT.md). Short version:

```bash
npx wrangler d1 migrations apply asymmetric-challenge --remote
SECRET_KEY_HEX=$(openssl rand -hex 32) npx opennextjs-cloudflare build
npx wrangler deploy --keep-vars
```

The only runtime secret is `SECRET_KEY_HEX` (`wrangler secret put`). The custom
domain `challenge.collapsetechnologies.com` is bound in `wrangler.jsonc`.
