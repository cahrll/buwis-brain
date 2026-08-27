import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { keywordSearch } from "../../src/lib/retrieval/keyword-search";
import { vectorSearch } from "../../src/lib/retrieval/vector-search";
import { storeDocument } from "../../src/lib/ingest/store";
import { basisVector, FakeEmbeddingProvider } from "../helpers/fake-embeddings";
import { makeTestPool, resetDatabase } from "../helpers/db";

const provider = new FakeEmbeddingProvider();

function chunk(ord: number, content: string) {
  return { ord, content, tokenCount: 10, pageStart: ord + 1, pageEnd: ord + 1, heading: null };
}

describe.skipIf(!process.env.DATABASE_URL_TEST)("retrieval legs", () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = makeTestPool();
    await resetDatabase(pool);
    await storeDocument(pool, provider, {
      title: "BIR Guide", filename: "bir.pdf", mimeType: "application/pdf",
      chunks: [
        chunk(0, "The eight percent income tax option applies to gross receipts of professionals."),
        chunk(1, "Percentage tax under Section 116 applies to non-VAT taxpayers."),
        chunk(2, "Voluntary PhilHealth members pay premiums based on declared monthly income."),
      ],
      embeddings: [basisVector(0), basisVector(1), basisVector(2)],
    });
  });

  afterAll(async () => {
    await pool.end();
  });

  it("vector leg orders by cosine similarity with correct metadata", async () => {
    // closest to basisVector(1), then 0, then 2
    const query = [0.9, 1, 0.1, ...new Array(1533).fill(0)];
    const hits = await vectorSearch(pool, query, 20);
    expect(hits).toHaveLength(3);
    expect(hits[0].content).toContain("Percentage tax");
    expect(hits[1].content).toContain("eight percent");
    expect(hits[0].similarity).toBeGreaterThan(hits[1].similarity);
    expect(hits[1].similarity).toBeGreaterThan(hits[2].similarity);
    expect(hits[0].documentTitle).toBe("BIR Guide");
    expect(hits[0].pageStart).toBe(2);
  });

  it("respects the vector limit", async () => {
    const hits = await vectorSearch(pool, basisVector(0), 2);
    expect(hits).toHaveLength(2);
  });

  it("keyword leg matches full-text and ranks matches only", async () => {
    const hits = await keywordSearch(pool, "PhilHealth premiums declared income", 20);
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0].content).toContain("PhilHealth");
  });

  it("keyword leg returns [] when nothing matches", async () => {
    const hits = await keywordSearch(pool, "zebra astronaut wormhole", 20);
    expect(hits).toEqual([]);
  });

  it("keyword leg survives raw punctuation input", async () => {
    await expect(keywordSearch(pool, "tax! (option) AND OR \"", 20)).resolves.toBeDefined();
  });
});
