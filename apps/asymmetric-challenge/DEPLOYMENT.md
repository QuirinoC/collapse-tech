# Deployment Notes (Vercel + Supabase)

## Supabase
1. Create a new Supabase project.
2. Open the SQL editor and run `supabase/schema.sql`.
3. Copy the Postgres connection string for `DATABASE_URL` (or the Supabase URL + service role key if you plan to use REST).

If you enable RLS, note that the default `postgres` role bypasses RLS. Use a restricted DB user if you want RLS enforced, or use Supabase REST with policies.

## Vercel
1. Import the `collapse-tech` Git repo into Vercel and set the project's **Root Directory** to `apps/asymmetric-challenge`.
2. Set environment variables:
   - `SECRET_KEY_HEX`
   - `DATABASE_URL` (preferred)
   - `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (fallback if DB host is unreachable)
3. Deploy with the default Next.js settings. Keep these variables scoped to this Vercel project; the Collapse Technologies site does not use them.

## Local Secret Rotation
Changing `SECRET_KEY_HEX` will change the public commitment hash and challenge ID. If the secret changes, existing guesses become invalid.
