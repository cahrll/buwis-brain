import { Pool } from "pg";
import { runMigrations } from "../../src/lib/migrations";

export function makeTestPool(): Pool {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error("DATABASE_URL_TEST is not set");
  return new Pool({ connectionString: url, max: 2 });
}

export async function resetDatabase(pool: Pool): Promise<void> {
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await runMigrations(pool);
}
