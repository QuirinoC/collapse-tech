// Lazy import: `pg` is only installed when a direct Postgres connection is used
// (DATABASE_URL set). Supabase-backed deployments don't need it.
export async function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }
  const { Pool } = await import("pg");
  return new Pool({
    connectionString,
    max: 1,
    ssl: { rejectUnauthorized: true },
  });
}
