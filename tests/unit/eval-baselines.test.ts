import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ResultsFileSchema } from "../../evals/src/types";

const dir = path.join(process.cwd(), "evals", "baselines");
const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")) : [];

describe("committed baselines", () => {
  it("has at least one baseline", () => {
    expect(files.length).toBeGreaterThan(0);
  });
  it.each(files)("%s is a clean, complete results file", (file) => {
    const parsed = ResultsFileSchema.safeParse(JSON.parse(readFileSync(path.join(dir, file), "utf8")));
    expect(parsed.success, parsed.success ? "" : parsed.error.issues[0]?.message).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.provenance.gitDirty).toBe(false);
    expect(parsed.data.provenance.partial).not.toBe(true);
    expect(parsed.data.provenance.rescoredFrom).toBeNull();
    expect(parsed.data.rows.length).toBe(parsed.data.provenance.questionCount * parsed.data.provenance.runs);
    expect(parsed.data.aggregates.counts.errorRate ?? 0).toBeLessThan(0.05);
  });
});
