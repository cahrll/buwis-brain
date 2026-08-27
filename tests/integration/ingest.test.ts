import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ProviderMismatchError, storeDocument } from "../../src/lib/ingest/store";
import {
  ingestDocument,
  UnsupportedFileTypeError,
} from "../../src/lib/ingest/ingest-service";
import { FakeEmbeddingProvider } from "../helpers/fake-embeddings";
import { makeTestPool, resetDatabase } from "../helpers/db";

const provider = new FakeEmbeddingProvider();
const md = (body: string) => ({
  filename: "guide.md",
  mimeType: "text/markdown",
  data: new TextEncoder().encode(body),
});
const MD_BODY =
  "# BIR\n\nSelf-employed professionals may elect the eight percent income tax option on gross receipts.\n\n## Deadlines\n\nQuarterly returns are due within sixty days following the close of each quarter.";

describe.skipIf(!process.env.DATABASE_URL_TEST)("ingest", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = makeTestPool();
  });

  beforeEach(async () => {
    await resetDatabase(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("ingests markdown end to end and records corpus_meta", async () => {
    const result = await ingestDocument(pool, provider, { ...md(MD_BODY), title: "BIR Guide" });
    expect(result.title).toBe("BIR Guide");
    expect(result.chunkCount).toBeGreaterThanOrEqual(2);
    expect(result.pageCount).toBeNull();
    const { rows: chunkRows } = await pool.query(
      "SELECT COUNT(*)::int AS n FROM chunks WHERE document_id = $1",
      [result.documentId],
    );
    expect(chunkRows[0].n).toBe(result.chunkCount);
    const { rows: meta } = await pool.query("SELECT provider_id, dimensions FROM corpus_meta");
    expect(meta).toEqual([{ provider_id: "fake:deterministic", dimensions: 1536 }]);
  });

  it("defaults title to filename", async () => {
    const result = await ingestDocument(pool, provider, md(MD_BODY));
    expect(result.title).toBe("guide.md");
  });

  it("rejects a mismatched provider with ProviderMismatchError", async () => {
    await ingestDocument(pool, provider, md(MD_BODY));
    const other = { id: "openai:text-embedding-3-small", dimensions: 1536 };
    await expect(
      storeDocument(pool, other, {
        title: "t",
        filename: "f.md",
        mimeType: "text/markdown",
        chunks: [
          { ord: 0, content: "some sufficiently long chunk content here", tokenCount: 8, pageStart: null, pageEnd: null, heading: null },
        ],
        embeddings: [new Array(1536).fill(0)],
      }),
    ).rejects.toBeInstanceOf(ProviderMismatchError);
    const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM documents");
    expect(rows[0].n).toBe(1); // the failed store left nothing behind
  });

  it("rejects a same-id different-dimensions provider with ProviderMismatchError", async () => {
    await ingestDocument(pool, provider, md(MD_BODY));
    const mismatched = {
      id: provider.id,
      dimensions: 512,
      embed: (texts: string[]) => provider.embed(texts),
    };
    await expect(
      ingestDocument(pool, mismatched, md(MD_BODY)),
    ).rejects.toBeInstanceOf(ProviderMismatchError);
    const { rows: docs } = await pool.query("SELECT COUNT(*)::int AS n FROM documents");
    expect(docs[0].n).toBe(1);
  });

  it("rolls back the whole document on a mid-insert failure", async () => {
    const chunk = {
      ord: 0, content: "duplicate ord chunk content for rollback test",
      tokenCount: 8, pageStart: null, pageEnd: null, heading: null,
    };
    await expect(
      storeDocument(pool, provider, {
        title: "t", filename: "f.md", mimeType: "text/markdown",
        chunks: [chunk, { ...chunk }], // same ord twice -> UNIQUE violation
        embeddings: [new Array(1536).fill(0), new Array(1536).fill(0)],
      }),
    ).rejects.toThrow(/duplicate key/);
    const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM documents");
    expect(rows[0].n).toBe(0);
  });

  it("rejects unsupported file types", async () => {
    await expect(
      ingestDocument(pool, provider, {
        filename: "img.png", mimeType: "image/png", data: new Uint8Array([1]),
      }),
    ).rejects.toBeInstanceOf(UnsupportedFileTypeError);
  });
});
