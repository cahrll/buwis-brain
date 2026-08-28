import { describe, expect, it } from "vitest";
import { AskResponseSchema, QuestionEntrySchema, ResultsFileSchema } from "../../evals/src/types";

const chunk = { chunkId: "c1", documentTitle: "Doc A", vectorRank: 1, keywordRank: null, similarity: 0.61, rrfScore: 0.0164 };
const response = {
  refused: false, reason: null, answer: "Yes [1].",
  citations: [{ index: 1, chunkId: "c1", documentTitle: "Doc A", pageStart: 2, pageEnd: 2, heading: null, content: "text" }],
  latencyMs: 8100,
  diagnostics: { chunks: [chunk], bestSimilarity: 0.61, simFloor: 0.3, usage: { model: "claude-opus-5", inputTokens: 5000, outputTokens: 300 } },
};

describe("AskResponseSchema", () => {
  it("accepts a debug response with titles and usage", () => {
    expect(AskResponseSchema.safeParse(response).success).toBe(true);
  });
  it("accepts a gate refusal with null usage", () => {
    const gated = { ...response, refused: true, reason: "low_confidence", answer: null, citations: [],
      diagnostics: { ...response.diagnostics, usage: null } };
    expect(AskResponseSchema.safeParse(gated).success).toBe(true);
  });
  it("rejects a chunk without documentTitle", () => {
    const { documentTitle: _t, ...bare } = chunk;
    const bad = { ...response, diagnostics: { ...response.diagnostics, chunks: [bare] } };
    expect(AskResponseSchema.safeParse(bad).success).toBe(false);
  });
});

const base = { id: "q-1", question: "Q?", category: "on_corpus_bir", expected: "answer", expectedDocs: ["ra-8424"], split: "test" };

describe("QuestionEntrySchema", () => {
  it("accepts a plain answer entry and defaults tags", () => {
    const out = QuestionEntrySchema.parse(base);
    expect(out.tags).toEqual([]);
  });
  it("rejects an answer entry without expectedDocs", () => {
    expect(QuestionEntrySchema.safeParse({ ...base, expectedDocs: [] }).success).toBe(false);
  });
  it("rejects a refuse entry with expectedDocs", () => {
    expect(QuestionEntrySchema.safeParse({ ...base, expected: "refuse" }).success).toBe(false);
  });
  it("requires currencyTrap and supersededBy together with the category", () => {
    const trap = { ...base, category: "currency_trap", currencyTrap: true,
      supersededBy: { rule: "RA 11976", effective: "2024-01-22", change: "fee abolished" } };
    expect(QuestionEntrySchema.safeParse(trap).success).toBe(true);
    expect(QuestionEntrySchema.safeParse({ ...trap, currencyTrap: undefined }).success).toBe(false);
    expect(QuestionEntrySchema.safeParse({ ...trap, supersededBy: undefined }).success).toBe(false);
    expect(QuestionEntrySchema.safeParse({ ...base, currencyTrap: true }).success).toBe(false);
  });
});

describe("ResultsFileSchema", () => {
  it("rejects a file missing provenance", () => {
    expect(ResultsFileSchema.safeParse({ aggregates: {}, flags: {}, rows: [] }).success).toBe(false);
  });
});
