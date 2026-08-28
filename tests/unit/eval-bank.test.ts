import path from "node:path";
import { describe, expect, it } from "vitest";
import { crossCheck, hashBank, loadBank, mapTitles, parseBank, selectEntries } from "../../evals/src/bank";
import { CATEGORIES, DocumentRegistrySchema, QuestionBankSchema } from "../../evals/src/types";

const documents = JSON.stringify({
  "ra-8424": { title: "Republic Act No. 8424", agency: "BIR", short: "NIRC" },
  "ra-11199-irr": { title: "IRR of Republic Act No. 11199", agency: "SSS", short: "SSS IRR" },
});
const questions = JSON.stringify({
  version: "test.1",
  entries: [
    { id: "a", question: "A?", category: "on_corpus_bir", expected: "answer", expectedDocs: ["ra-8424"], split: "test" },
    { id: "b", question: "B?", category: "on_corpus_sss", expected: "answer", expectedDocs: ["ra-11199-irr"], split: "dev" },
    { id: "c", question: "C?", category: "off_corpus", expected: "refuse", split: "test" },
  ],
});

describe("parseBank", () => {
  it("loads both files, indexes titles and hashes content", () => {
    const loaded = parseBank(documents, questions);
    expect(loaded.bank.entries).toHaveLength(3);
    expect(loaded.titleToKey.get("Republic Act No. 8424")).toBe("ra-8424");
    expect(loaded.hash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
  it("rejects unknown docKeys and duplicate ids", () => {
    // crossCheck takes parsed entries (defaults applied), so parse before tampering
    const bad = QuestionBankSchema.parse(JSON.parse(questions));
    bad.entries.push({ id: "a", question: "dup", category: "deep_nirc", expected: "answer", expectedDocs: ["nope"], split: "test", tags: [] });
    expect(crossCheck(DocumentRegistrySchema.parse(JSON.parse(documents)), bad)).toEqual(["duplicate id a", "a: unknown docKey nope"]);
    expect(() => parseBank(documents, JSON.stringify(bad))).toThrow(/question bank invalid/);
  });
});

describe("hashBank", () => {
  it("is deterministic and sensitive to a one-byte edit", () => {
    expect(hashBank(documents, questions)).toBe(hashBank(documents, questions));
    expect(hashBank(documents, questions + " ")).not.toBe(hashBank(documents, questions));
  });
});

describe("selectEntries", () => {
  const { bank } = parseBank(documents, questions);
  it("filters by split and returns all for all", () => {
    expect(selectEntries(bank, { split: "test" }).map((e) => e.id)).toEqual(["a", "c"]);
    expect(selectEntries(bank, { split: "dev" }).map((e) => e.id)).toEqual(["b"]);
    expect(selectEntries(bank, { split: "all" })).toHaveLength(3);
  });
  it("uses explicit ids over the split and rejects unknown ids", () => {
    expect(selectEntries(bank, { split: "dev", questions: ["a", "c"] }).map((e) => e.id)).toEqual(["a", "c"]);
    expect(() => selectEntries(bank, { split: "all", questions: ["zzz"] })).toThrow(/unknown question ids: zzz/);
  });
});

describe("mapTitles", () => {
  it("maps known titles to distinct keys and collects unknown ones once", () => {
    const { titleToKey } = parseBank(documents, questions);
    const out = mapTitles(["Republic Act No. 8424", "Mystery", "Republic Act No. 8424", "Mystery"], titleToKey);
    expect(out).toEqual({ keys: ["ra-8424"], unknown: ["Mystery"] });
  });
});

describe("committed bank", () => {
  const loaded = loadBank(path.join(process.cwd(), "evals", "bank"));
  const entries = loaded.bank.entries;

  it("has at least 40 entries and a version", () => {
    expect(entries.length).toBeGreaterThanOrEqual(40);
    expect(loaded.bank.version).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
  });
  it("covers every category with at least one dev entry each", () => {
    for (const category of CATEGORIES) {
      const inCategory = entries.filter((e) => e.category === category);
      expect(inCategory.length, category).toBeGreaterThan(0);
      expect(inCategory.some((e) => e.split === "dev"), `${category} needs a dev entry`).toBe(true);
    }
  });
  it("keeps the dev share near 30 percent", () => {
    const dev = entries.filter((e) => e.split === "dev").length / entries.length;
    expect(dev).toBeGreaterThanOrEqual(0.2);
    expect(dev).toBeLessThanOrEqual(0.4);
  });
  it("registers all eight production documents", () => {
    expect(Object.keys(loaded.documents).sort()).toEqual([
      "ra-10963", "ra-11199-irr", "ra-11223", "ra-8424", "ra-9679", "ra-9679-irr", "rr-8-2018", "rr-8-2018-digest",
    ]);
  });
});
