import { describe, expect, it } from "vitest";
import type { AskResult } from "../../evals/src/client";
import { collect, progressLine, toRow, WARM_UP_QUESTION } from "../../evals/src/collect";
import type { QuestionEntry, Row } from "../../evals/src/types";

const titleToKey = new Map([["Doc A", "doc-a"]]);
const entries: QuestionEntry[] = [
  { id: "q1", question: "One?", category: "on_corpus_bir", expected: "answer", expectedDocs: ["doc-a"], split: "test", tags: [] },
  { id: "q2", question: "Two?", category: "off_corpus", expected: "refuse", expectedDocs: [], split: "test", tags: [] },
];
const answered: AskResult = {
  ok: true, roundTripMs: 7200,
  response: {
    refused: false, reason: null, answer: "Yes [1].",
    citations: [{ index: 1, chunkId: "ca", documentTitle: "Doc A", pageStart: 1, pageEnd: 1, heading: null, content: "a" }],
    latencyMs: 7000,
    diagnostics: { chunks: [{ chunkId: "ca", documentTitle: "Doc A", vectorRank: 1, keywordRank: null, similarity: 0.6, rrfScore: 0.0164 }],
      bestSimilarity: 0.6, simFloor: 0.3, usage: { model: "claude-opus-5", inputTokens: 4000, outputTokens: 100 } },
  },
};
const failed: AskResult = { ok: false, error: "HTTP 502: nope", roundTripMs: 3000 };

describe("toRow", () => {
  it("maps a success to an answered row with docs and usd", () => {
    const row = toRow(entries[0], 2, answered, titleToKey);
    expect(row).toMatchObject({
      questionId: "q1", run: 2, category: "on_corpus_bir", expected: "answer", outcome: "answered", refused: false,
      citedDocs: ["doc-a"], retrievedDocs: ["doc-a"], bestSimilarity: 0.6, latencyMs: 7000, roundTripMs: 7200,
      usage: { model: "claude-opus-5", inputTokens: 4000, outputTokens: 100 }, error: null,
    });
    expect(row.usd).toBeCloseTo(0.0225, 10);
    expect(row.response).toEqual(answered.response);
  });
  it("maps a failure to an error row with a null response", () => {
    expect(toRow(entries[1], 1, failed, titleToKey)).toEqual({
      questionId: "q2", run: 1, category: "off_corpus", expected: "refuse", outcome: "error", refused: null, reason: null,
      answer: null, citedDocs: [], retrievedDocs: [], bestSimilarity: null, latencyMs: null, roundTripMs: 3000,
      usage: null, usd: null, error: "HTTP 502: nope", response: null,
    });
  });
});

describe("progressLine", () => {
  it("prints run, position, id, outcome, latency and hit", () => {
    const row = toRow(entries[0], 1, answered, titleToKey);
    expect(progressLine(1, 3, 2, 34, entries[0], row)).toMatch(/^\[run 1\/3\]\s+2\/34 q1\s+answered\s+7000 ms  hit$/);
    const err = toRow(entries[1], 1, failed, titleToKey);
    expect(progressLine(2, 3, 1, 34, entries[1], err)).toMatch(/error\s+3000 ms  -$/);
  });
});

describe("collect", () => {
  function fakeAsk() {
    const calls: string[] = [];
    const askFn = async (_base: string, question: string) => {
      calls.push(question);
      return question === "Two?" ? failed : answered;
    };
    return { calls, askFn: askFn as unknown as typeof import("../../evals/src/client").ask };
  }

  it("warms up once, then runs full passes in bank order", async () => {
    const { calls, askFn } = fakeAsk();
    const rows: Row[] = [];
    const lines: string[] = [];
    const out = await collect({ baseUrl: "https://x", entries, runs: 2, titleToKey, ask: askFn, onRow: (r) => rows.push(r), onProgress: (l) => lines.push(l) });
    expect(out).toEqual({ partial: false });
    expect(calls).toEqual([WARM_UP_QUESTION, "One?", "Two?", "One?", "Two?"]);
    expect(rows.map((r) => [r.questionId, r.run])).toEqual([["q1", 1], ["q2", 1], ["q1", 2], ["q2", 2]]);
    expect(lines).toHaveLength(4);
  });

  it("stops between requests when asked and reports partial", async () => {
    const { askFn } = fakeAsk();
    const rows: Row[] = [];
    const out = await collect({ baseUrl: "https://x", entries, runs: 2, titleToKey, ask: askFn, onRow: (r) => rows.push(r), shouldStop: () => rows.length >= 3 });
    expect(out).toEqual({ partial: true });
    expect(rows).toHaveLength(3);
  });
});
