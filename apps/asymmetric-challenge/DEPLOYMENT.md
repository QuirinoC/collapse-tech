# Deployment Notes (Cloudflare Workers + Supabase)

## Supabase
1. Create a new Supabase project.
2. Open the SQL editor and run `supabase/schema.sql`. Re-run the idempotent
   script when upgrading an existing deployment: it converts the historical
   telemetry view to a one-row counter, preserves the accumulated totals, and
   permanently removes the old per-client telemetry records. Export those
   records first if a separate legal retention requirement applies.
3. Copy the Supabase project URL and service-role key. The app uses Supabase's
   HTTPS API and does not support direct `DATABASE_URL` connections.

The schema enables RLS and permits its counter function only to Supabase's
`service_role`; no direct table access is granted to public or client roles.

For an upgrade, first quiesce Worker traffic and allow in-flight requests to
finish. The schema runs as one transaction, locking `winners` through duplicate
validation and singleton-constraint installation, then locking telemetry while
it aggregates and removes the old table. Deploy the new Worker only after the
transaction commits, then resume traffic. If the script reports multiple
historical winners, it rolls back without changing telemetry or winner data;
resolve the duplicate claims and retain only the verified earliest winner before
re-running it.

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
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Note: `SECRET_KEY_HEX` is read at import time — it must exist even for local
builds (`SECRET_KEY_HEX=$(openssl rand -hex 32) npx opennextjs-cloudflare build`).

Keep these variables scoped to this app; the Collapse Technologies site does not use them.

## Restoring a stats outage

If `/api/stats` logs `{"event":"stats_query_failed","provider":"supabase","code":"1016"}`,
the configured Supabase host has a DNS/origin failure. Restore or verify the
Supabase project, then update `SUPABASE_URL` with the project's canonical API
URL from its dashboard. Run `supabase/schema.sql` before deploying the Worker;
do not replace unavailable totals with a client-side estimate.
Target domain after deploy: `challenge.collapsetechnologies.com` (custom domain on the Worker).

## Local Secret Rotation
Changing `SECRET_KEY_HEX` will change the public commitment hash and challenge ID. If the secret changes, existing guesses become invalid.
