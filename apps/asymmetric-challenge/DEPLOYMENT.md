# Deployment Notes (Cloudflare Workers + D1)

## D1

Stats, telemetry, and winner claims persist in the `asymmetric-challenge` D1
database bound as `DB` in `wrangler.jsonc`. Schema lives in
`d1/migrations/` — apply it with Wrangler, not a third-party SQL dashboard:

```bash
npx wrangler d1 migrations apply asymmetric-challenge --local
npx wrangler d1 migrations apply asymmetric-challenge --remote
```

The migration creates a singleton `telemetry_totals` row (global attempt
counters) and a single-slot `winners` table. A second winning claim hits the
unique `winner_slot` constraint and returns `already_won`.

## Cloudflare Workers (via @opennextjs/cloudflare)

The app runs on a Cloudflare Worker through the OpenNext adapter
(`open-next.config.ts` + `wrangler.jsonc` in this directory). Build and deploy:

```bash
npm install --legacy-peer-deps   # adapter peer-wants next >= 16.2.11
npx opennextjs-cloudflare build
npx wrangler deploy --keep-vars
```

`--keep-vars` preserves dashboard/runtime secrets already on the Worker,
including `SECRET_KEY_HEX`. Do not rotate that secret unless you intend to
change the public commitment hash.

`SECRET_KEY_HEX` must exist at build time so Next can evaluate server modules
(`SECRET_KEY_HEX=$(openssl rand -hex 32) npx opennextjs-cloudflare build` is
enough for CI). Production reads the Worker secret at request time so a dummy
build value does not replace the live challenge key.

Keep `SECRET_KEY_HEX` scoped to this app; the Collapse Technologies site does
not use it.

Target domain after deploy: `challenge.collapsetechnologies.com` (custom domain
on the Worker).

## Local Secret Rotation

Changing `SECRET_KEY_HEX` will change the public commitment hash and challenge
ID. If the secret changes, existing guesses become invalid.
