# Deployment Notes (Cloudflare Workers + Supabase)

## Supabase
1. Create a new Supabase project.
2. Open the SQL editor and run `supabase/schema.sql`.
3. Copy the Postgres connection string for `DATABASE_URL` (or the Supabase URL + service role key if you plan to use REST).

If you enable RLS, note that the default `postgres` role bypasses RLS. Use a restricted DB user if you want RLS enforced, or use Supabase REST with policies.

## Cloudflare Workers (via @opennextjs/cloudflare)

The app runs on a Cloudflare Worker through the OpenNext adapter
(`open-next.config.ts` + `wrangler.jsonc` in this directory). Build and deploy:

```bash
npm install --legacy-peer-deps   # adapter peer-wants next >= 16.2.11
npx opennextjs-cloudflare build
npx wrangler deploy
```

Environment variables (set as Worker secrets via `wrangler secret put`):

- `SECRET_KEY_HEX`
- `DATABASE_URL` (preferred)
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (fallback if DB host is unreachable)

Note: `SECRET_KEY_HEX` is read at import time — it must exist even for local
builds (`SECRET_KEY_HEX=$(openssl rand -hex 32) npx opennextjs-cloudflare build`).

Keep these variables scoped to this app; the Collapse Technologies site does not use them.
Target domain after deploy: `challenge.collapsetechnologies.com` (custom domain on the Worker).

## Local Secret Rotation
Changing `SECRET_KEY_HEX` will change the public commitment hash and challenge ID. If the secret changes, existing guesses become invalid.
