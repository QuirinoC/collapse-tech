let pool;

// Lazy import: `pg` is only installed when a direct Postgres connection is used
// (DATABASE_URL set). Supabase-backed deployments don't need it.
export async function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is required");
    }
    const { Pool } = await import("pg");
    pool = new Pool({
      connectionString,
      max: 5,
      ssl: { rejectUnauthorized: false },
    });
  }
  return pool;
}
