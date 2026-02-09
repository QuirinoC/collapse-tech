# Deployment Notes (Vercel + Supabase)

## Supabase
1. Create a new Supabase project.
2. Open the SQL editor and run `supabase/schema.sql`.
3. Copy the project URL and the service role key for server-side inserts.

## Vercel
1. Import the Git repo into Vercel.
2. Set environment variables:
   - `SECRET_KEY_HEX`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
3. Deploy with the default Next.js settings.

## Local Secret Rotation
Changing `SECRET_KEY_HEX` will change the public commitment hash and challenge ID. If the secret changes, existing guesses become invalid.
