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
- `SUPABASE_URL`: Supabase project URL.
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key for server-side inserts.

Generate a secret:
```bash
openssl rand -hex 32
```

## Telemetry
The client batches attempt counts and sends aggregates every 10 seconds or 25,000 attempts, whichever comes first. A final batch is sent on tab close when possible.

## Claim Flow
If the client finds a matching hash, it calls `/api/claim`. The server verifies the guess against the secret and stores the first winner. Subsequent claims return `already_won`.
