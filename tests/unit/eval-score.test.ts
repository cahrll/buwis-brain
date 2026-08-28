import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseBank } from "../../evals/src/bank";
import { deriveRow, nearestRank, outcomeOf, rate, scoreRows } from "../../evals/src/score";
import { RowSchema, type Row } from "../../evals/src/types";

const dir = path.join(process.cwd(), "tests", "fixtures", "eval");
const read = (name: string) => readFileSync(path.join(dir, name), "utf8");
const bank = parseBank(read("documents.json"), read("questions.json"));
const rows: Row[] = JSON.parse(read("rows-sample.json"));
const { aggregates, flags, skippedQuestionIds } = scoreRows(rows, bank, 2);

describe("fixture", () => {
  it("validates against the row schema", () => {
    for (const row of rows) expect(RowSchema.safeParse(row).success, row.questionId).toBe(true);
    expect(rows).toHaveLength(16);
    expect(skippedQuestionIds).toEqual([]);
  });
});

describe("helpers", () => {
  it("nearestRank matches scripts/latency.ts and handles empty input", () => {
    expect(nearestRank([5, 1, 3], 0.5)).toBe(3);
    expect(nearestRank([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.95)).toBe(10);
    expect(nearestRank([], 0.5)).toBeNull();
  });
  it("rate is null on an empty denominator", () => {
    expect(rate(0, 0)).toBeNull();
    expect(rate(1, 4)).toBe(0.25);
  });
  it("outcomeOf keys gate refusals on low_confidence", () => {
    expect(outcomeOf(false, null)).toBe("answered");
    expect(outcomeOf(true, "low_confidence")).toBe("refused_gate");
    expect(outcomeOf(true, "unsupported_answer")).toBe("refused_model");
  });
  it("deriveRow recomputes docs, outcome and usd from the response", () => {
    const stale = { ...rows[0], citedDocs: ["wrong"], retrievedDocs: [], outcome: "error" as const, usd: 99 };
    const fresh = deriveRow(stale, bank.titleToKey);
    expect(fresh.citedDocs).toEqual(["doc-a"]);
    expect(fresh.retrievedDocs).toEqual(["doc-a", "doc-b"]);
    expect(fresh.outcome).toBe("answered");
    expect(fresh.usd).toBeCloseTo(0.0325, 10);
    expect(deriveRow(rows[14], bank.titleToKey)).toEqual(rows[14]);
  });
});

describe("aggregates", () => {
  it("counts rows, errors and LLM calls", () => {
    expect(aggregates.counts).toEqual({ rows: 16, errors: 1, llmCalls: 12, errorRate: 1 / 16 });
  });
  it("scores retrieval against expected docs from the diagnostic top 8", () => {
    expect(aggregates.retrieval.anyHitRate).toBeCloseTo(10 / 11, 10);
    expect(aggregates.retrieval.allExpectedDocsRate).toBe(0.5);
    expect(aggregates.retrieval.citedHitRate).toBe(7 / 8);
  });
  it("splits refusals between gate and model", () => {
    expect(aggregates.refusal).toEqual({
      correctRefusalRate: 0.75, correctRefusalAtGateRate: 0.5, offCorpusReachedLlmRate: 0.5,
      falseRefusalRate: 2 / 9, falseRefusalAtGateRate: 1 / 9, falseRefusalByModelRate: 1 / 9,
    });
  });
  it("measures behavior stability first and doc-set stability second, excluding errors", () => {
    expect(aggregates.stability.behaviorStabilityRate).toBeCloseTo(5 / 7, 10);
    expect(aggregates.stability.docSetStabilityRate).toBeCloseTo(2 / 3, 10);
  });
  it("reports stability as null for a single run", () => {
    expect(scoreRows(rows, bank, 1).aggregates.stability).toEqual({ behaviorStabilityRate: null, docSetStabilityRate: null });
  });
  it("computes nearest-rank latency percentiles", () => {
    expect(aggregates.latency).toEqual({
      server: { p50: 6500, p95: 9500 },
      roundTrip: { p50: 6700, p95: 9700 },
      byOutcome: { answered: { p50: 7000 }, refused: { p50: 950 } },
    });
  });
  it("prices known models, counts unpriced ones and lists models seen", () => {
    expect(aggregates.cost.meanInputTokens).toBeCloseTo(51200 / 12, 6);
    expect(aggregates.cost.meanOutputTokens).toBe(140);
    expect(aggregates.cost.totalUsd).toBeCloseTo(0.2755, 10);
    expect(aggregates.cost.meanUsdPerQuestion).toBeCloseTo(0.2755 / 14, 10);
    expect(aggregates.cost.meanUsdPerLlmCall).toBeCloseTo(0.2755 / 11, 10);
    expect(aggregates.cost.unpricedLlmCalls).toBe(1);
    expect(aggregates.cost.models).toEqual(["claude-opus-5", "claude-mystery-9"]);
  });
  it("measures the keyword leg contribution", () => {
    expect(aggregates.keywordLeg).toEqual({ chunkShare: 2 / 20, questionShare: 2 / 15 });
  });
  it("summarizes best similarity per expected class", () => {
    expect(aggregates.similarity.answer).toEqual({ min: 0.25, median: 0.57, max: 0.62 });
    expect(aggregates.similarity.refuse).toEqual({ min: 0.15, median: 0.16, max: 0.40 });
  });
  it("breaks down by category and tag", () => {
    expect(aggregates.byCategory.off_corpus.refusal.correctRefusalRate).toBe(0.75);
    expect(aggregates.byCategory.on_corpus_bir.retrieval.anyHitRate).toBe(1);
    expect(aggregates.byTag["near-domain"].refusal.offCorpusReachedLlmRate).toBe(1);
    expect(aggregates.byTag.t1.stability.behaviorStabilityRate).toBe(1);
  });
});

describe("flags", () => {
  it("lists unstable questions with per-run outcomes", () => {
    expect(flags.unstableQuestions.map((u) => u.questionId)).toEqual(["q-refuse-model", "q-either"]);
    expect(flags.unstableQuestions[0].outcomes).toEqual([
      { run: 1, outcome: "refused_model", citedDocs: [] },
      { run: 2, outcome: "answered", citedDocs: ["doc-a"] },
    ]);
  });
  it("lists false and missed refusals", () => {
    expect(flags.falseRefusals).toEqual([
      { questionId: "q-false-refusal", run: 1, outcome: "refused_model", reason: "unsupported_answer" },
      { questionId: "q-false-refusal", run: 2, outcome: "refused_gate", reason: "low_confidence" },
    ]);
    expect(flags.missedRefusals).toEqual([{ questionId: "q-refuse-model", run: 2, citedDocs: ["doc-a"] }]);
  });
  it("lists retrieval misses, trap answers and unknown titles", () => {
    expect(flags.retrievalMisses).toEqual([{ questionId: "q-false-refusal", run: 2, expectedDocs: ["doc-b"], retrievedDocs: ["doc-a"] }]);
    expect(flags.currencyTrapAnswers).toHaveLength(2);
    expect(flags.currencyTrapAnswers[0]).toEqual({
      questionId: "q-trap", run: 1, answer: "The fee is 500 pesos [1].",
      supersededBy: { rule: "RA 11976", effective: "2024-01-22", change: "fee abolished" },
    });
    expect(flags.unknownTitles).toEqual(["Ghost Doc"]);
  });
});

describe("rescoring", () => {
  it("skips rows whose question left the bank instead of throwing", () => {
    const extra = { ...rows[0], questionId: "q-gone" };
    const out = scoreRows([...rows, extra], bank, 2);
    expect(out.skippedQuestionIds).toEqual(["q-gone"]);
    expect(out.aggregates.counts.rows).toBe(16);
  });
});
