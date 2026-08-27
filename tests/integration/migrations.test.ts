import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeTestPool, resetDatabase } from "../helpers/db";

describe.skipIf(!process.env.DATABASE_URL_TEST)("migrations", () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = makeTestPool();
    await resetDatabase(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("creates documents, chunks, corpus_meta", async () => {
    const { rows } = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' ORDER BY table_name`,
    );
    const names = rows.map((r) => r.table_name);
    expect(names).toContain("documents");
    expect(names).toContain("chunks");
    expect(names).toContain("corpus_meta");
  });

  it("is idempotent", async () => {
    const { runMigrations } = await import("../../src/lib/migrations");
    await expect(runMigrations(pool)).resolves.toBeUndefined();
  });

  it("enforces UNIQUE (document_id, ord)", async () => {
    const { rows } = await pool.query(
      `INSERT INTO documents (title, filename, mime_type)
       VALUES ('t', 'f.md', 'text/markdown') RETURNING id`,
    );
    const docId = rows[0].id;
    const zeros = JSON.stringify(new Array(1536).fill(0));
    const insert = `INSERT INTO chunks (document_id, ord, content, token_count, embedding)
                    VALUES ($1, 0, 'hello world content', 3, $2::vector)`;
    await pool.query(insert, [docId, zeros]);
    await expect(pool.query(insert, [docId, zeros])).rejects.toThrow(/duplicate key/);
  });
});
