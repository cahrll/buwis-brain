import { describe, expect, it } from "vitest";
import { crossCheck, hashBank, mapTitles, parseBank, selectEntries } from "../../evals/src/bank";
import { DocumentRegistrySchema, QuestionBankSchema } from "../../evals/src/types";

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
