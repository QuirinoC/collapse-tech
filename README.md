# Asymmetric Challenge

A minimal, Yeezy-inspired web experiment where anyone can guess a 256-bit key and win $100. The browser verifies guesses locally by hashing and comparing to a public commitment, so there are no per-guess server calls. The server only verifies a claim on a match.

## Stack
- Next.js (App Router)
- Supabase Postgres (telemetry + winner state)
- Vercel hosting (Hobby plan)

## Setup
1. Install dependencies.
   ```bash
   npm install
   ```

2. Create `.env.local` using `.env.example`.

3. Create the Supabase tables.
   - Open the Supabase SQL editor and run `supabase/schema.sql`.

4. Run locally.
   ```bash
   npm run dev
   ```

## Environment Variables
- `SECRET_KEY_HEX`: 64 hex characters (256-bit secret).
- `DATABASE_URL`: Supabase Postgres connection string (preferred if reachable).
- `SUPABASE_URL`: Supabase project URL (used for REST fallback).
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key (used for REST fallback).

Note: The app prefers direct Postgres via `DATABASE_URL`. If the DB hostname is unreachable (common on Vercel with invalid pooler host), it falls back to Supabase REST using `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`. If you enable RLS, direct Postgres with the `postgres` role bypasses it. For RLS enforcement, use a restricted DB user or rely on Supabase REST with policies.

Generate a secret:
```bash
openssl rand -hex 32
```

## Telemetry
The client batches attempt counts and sends aggregates every 10 seconds or 25,000 attempts, whichever comes first. A final batch is sent on tab close when possible.

## Claim Flow
If the client finds a matching hash, it calls `/api/claim`. The server verifies the guess against the secret and stores the first winner. Subsequent claims return `already_won`.
