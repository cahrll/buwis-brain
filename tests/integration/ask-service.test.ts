import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ModelAnswer } from "../../src/lib/answer/schema";
import { askQuestion } from "../../src/lib/ask-service";
import { storeDocument } from "../../src/lib/ingest/store";
import type { RetrievedChunk } from "../../src/lib/retrieval/types";
import { basisVector, FakeEmbeddingProvider } from "../helpers/fake-embeddings";
import { makeTestPool, resetDatabase } from "../helpers/db";

const ON_CORPUS_Q = "Can professionals use the eight percent income tax option?";
const OFF_CORPUS_Q = "who won the 2022 PH election?";

// query embedding sits right on chunk 0's vector for the on-corpus question,
// and far from everything (basis 100) for the off-corpus one
const provider = new FakeEmbeddingProvider(
  new Map([
    [ON_CORPUS_Q, basisVector(0)],
    [OFF_CORPUS_Q, basisVector(100)],
  ]),
);

function chunk(ord: number, content: string) {
  return { ord, content, tokenCount: 10, pageStart: ord + 1, pageEnd: ord + 1, heading: null };
}

const answerFake =
  (answer: ModelAnswer) =>
  async (_chunks: RetrievedChunk[], _q: string): Promise<ModelAnswer> =>
    answer;

describe.skipIf(!process.env.DATABASE_URL_TEST)("askQuestion", () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = makeTestPool();
    await resetDatabase(pool);
    await storeDocument(pool, provider, {
      title: "BIR Guide", filename: "bir.pdf", mimeType: "application/pdf",
      chunks: [
        chunk(0, "Professionals may elect the eight percent income tax option on gross receipts."),
        chunk(1, "Percentage tax under Section 116 applies to non-VAT taxpayers."),
      ],
      embeddings: [basisVector(0), basisVector(1)],
    });
  });

  afterAll(async () => {
    await pool.end();
  });

  it("answers on-corpus with resolved citations", async () => {
    const synthesizeFn = answerFake({
      refused: false, reason: null, answer: "Yes, the 8% option applies [1].", citations: [1],
    });
    const out = await askQuestion({ pool, provider, synthesizeFn }, { question: ON_CORPUS_Q });
    expect(out.refused).toBe(false);
    expect(out.answer).toContain("[1]");
    expect(out.citations).toHaveLength(1);
    expect(out.citations[0].index).toBe(1);
    expect(out.citations[0].content).toContain("eight percent");
    expect(out.citations[0].documentTitle).toBe("BIR Guide");
    expect(typeof out.citations[0].chunkId).toBe("string");
    expect(out.latencyMs).toBeGreaterThanOrEqual(0);
    expect(out.diagnostics).toBeUndefined();
  });

  it("gates off-corpus questions without calling the model", async () => {
    let called = false;
    const synthesizeFn = async (): Promise<ModelAnswer> => {
      called = true;
      return { refused: false, reason: null, answer: "x [1]", citations: [1] };
    };
    const out = await askQuestion({ pool, provider, synthesizeFn }, { question: OFF_CORPUS_Q });
    expect(called).toBe(false);
    expect(out.refused).toBe(true);
    expect(out.reason).toBe("low_confidence");
    expect(out.citations).toEqual([]);
  });

  it("includes read-only diagnostics on refusals when debug is set", async () => {
    const synthesizeFn = answerFake({ refused: false, reason: null, answer: "x [1]", citations: [1] });
    const out = await askQuestion(
      { pool, provider, synthesizeFn },
      { question: OFF_CORPUS_Q, debug: true },
    );
    expect(out.refused).toBe(true);
    expect(out.diagnostics).toBeDefined();
    expect(out.diagnostics!.simFloor).toBe(0.3);
    expect(out.diagnostics!.bestSimilarity).toBeLessThan(0.3);
    expect(out.diagnostics!.chunks.length).toBeGreaterThan(0);
    const d = out.diagnostics!.chunks[0];
    expect(d).toHaveProperty("chunkId");
    expect(d).toHaveProperty("vectorRank");
    expect(d).toHaveProperty("keywordRank");
    expect(d).toHaveProperty("similarity");
    expect(d).toHaveProperty("rrfScore");
  });

  it("applies the reconciliation downgrade to unsupported answers", async () => {
    const synthesizeFn = answerFake({
      refused: false, reason: null, answer: "Confident but uncited.", citations: [],
    });
    const out = await askQuestion({ pool, provider, synthesizeFn }, { question: ON_CORPUS_Q });
    expect(out.refused).toBe(true);
    expect(out.reason).toBe("unsupported_answer");
    expect(out.citations).toEqual([]);
  });
});
