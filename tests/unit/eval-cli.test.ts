import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseBank } from "../../evals/src/bank";
import { decideWrite, formatSummary, parseCliOptions, resultsFileName } from "../../evals/src/cli";
import { buildProvenance } from "../../evals/src/provenance";
import { scoreRows } from "../../evals/src/score";
import type { ResultsFile, Row } from "../../evals/src/types";

describe("parseCliOptions", () => {
  it("applies defaults for run", () => {
    expect(parseCliOptions(["run"])).toEqual({
      command: "run", split: "test", runs: 3, questions: [], baseline: null, force: false, out: "evals/results", file: null,
    });
  });
  it("parses every flag", () => {
    expect(parseCliOptions(["run", "--split", "dev", "--runs", "1", "--questions", "a, b", "--baseline", "production", "--force", "--out", "tmp"]))
      .toEqual({ command: "run", split: "dev", runs: 1, questions: ["a", "b"], baseline: "production", force: true, out: "tmp", file: null });
  });
  it("rejects bad runs, bad split, bad label, unknown command and score without a file", () => {
    expect(() => parseCliOptions(["run", "--runs", "0"])).toThrow(/--runs/);
    expect(() => parseCliOptions(["run", "--runs", "x"])).toThrow(/--runs/);
    expect(() => parseCliOptions(["run", "--split", "prod"])).toThrow(/--split/);
    expect(() => parseCliOptions(["run", "--baseline", "Prod Run"])).toThrow(/--baseline/);
    expect(() => parseCliOptions(["fly"])).toThrow(/usage/);
    expect(() => parseCliOptions(["score"])).toThrow(/results file/);
  });
  it("parses score with a file", () => {
    expect(parseCliOptions(["score", "evals/results/x.json"]).file).toBe("evals/results/x.json");
  });
});

describe("decideWrite", () => {
  it("warns but writes plain runs from a dirty tree", () => {
    expect(decideWrite({ baseline: null, gitDirty: true, force: false, partial: false })).toEqual({ ok: true, warning: expect.stringMatching(/dirty/) });
    expect(decideWrite({ baseline: null, gitDirty: false, force: false, partial: true })).toEqual({ ok: true, warning: null });
  });
  it("refuses a baseline from a dirty tree unless forced", () => {
    expect(decideWrite({ baseline: "production", gitDirty: true, force: false, partial: false })).toEqual({ ok: false, reason: expect.stringMatching(/--force/) });
    expect(decideWrite({ baseline: "production", gitDirty: true, force: true, partial: false })).toEqual({ ok: true, warning: expect.stringMatching(/--force/) });
    expect(decideWrite({ baseline: "production", gitDirty: false, force: false, partial: false })).toEqual({ ok: true, warning: null });
  });
  it("refuses a partial baseline with no override", () => {
    expect(decideWrite({ baseline: "production", gitDirty: false, force: true, partial: true })).toEqual({ ok: false, reason: expect.stringMatching(/partial/) });
  });
});

describe("resultsFileName", () => {
  const now = new Date("2026-08-28T12:34:56.789Z");
  it("uses a filesystem-safe timestamp for plain runs and date plus label for baselines", () => {
    expect(resultsFileName(now, null)).toBe("2026-08-28T12-34-56Z.json");
    expect(resultsFileName(now, "production")).toBe("2026-08-28-production.json");
  });
});

describe("formatSummary", () => {
  it("prints the headline numbers and flag counts", () => {
    const dir = path.join(process.cwd(), "tests", "fixtures", "eval");
    const read = (n: string) => readFileSync(path.join(dir, n), "utf8");
    const bank = parseBank(read("documents.json"), read("questions.json"));
    const rows: Row[] = JSON.parse(read("rows-sample.json"));
    const { aggregates, flags } = scoreRows(rows, bank, 2);
    const file: ResultsFile = {
      provenance: buildProvenance({ targetUrl: "https://x", git: { gitCommit: "abc", gitDirty: false }, bankVersion: "fixture.1", bankHash: bank.hash, split: "test", runs: 2, questionCount: 8, partial: false, corpus: null }),
      aggregates, flags, rows,
    };
    const text = formatSummary(file, "evals/results/x.json");
    expect(text).toContain("results: evals/results/x.json");
    expect(text).toContain("rows 16 (errors 1, llm calls 12)");
    expect(text).toContain("stability behavior 0.714 docSet 0.667");
    expect(text).toContain("latency server p50 6500 ms p95 9500 ms");
    expect(text).toContain("flags unstable 2, falseRefusals 2, missedRefusals 1, retrievalMisses 1, trapAnswers 2, unknownTitles 1");
  });
});
