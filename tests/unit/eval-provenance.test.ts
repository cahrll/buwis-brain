import { describe, expect, it } from "vitest";
import { buildProvenance, fetchCorpusSnapshot, gitInfo } from "../../evals/src/provenance";

function execWith(commit: string, status: string) {
  return (cmd: string, args: string[]) => {
    if (cmd !== "git") throw new Error("unexpected command");
    return args[0] === "rev-parse" ? commit : status;
  };
}

describe("gitInfo", () => {
  it("reports the commit and a clean tree", () => {
    expect(gitInfo(execWith("abc123", ""))).toEqual({ gitCommit: "abc123", gitDirty: false });
  });
  it("reports a dirty tree when porcelain output is non-empty", () => {
    expect(gitInfo(execWith("abc123", " M README.md\n"))).toEqual({ gitCommit: "abc123", gitDirty: true });
  });
  it("falls back to unknown when git is unavailable", () => {
    const exec = () => { throw new Error("not a git repository"); };
    expect(gitInfo(exec)).toEqual({ gitCommit: "unknown", gitDirty: false });
  });
});

const stats = {
  documents: [{ id: "x", title: "Doc A", chunkCount: 30, pageCount: 26, createdAt: "2026-08-28T09:01:33.085Z" }],
  totalChunks: 30,
  corpusMeta: { providerId: "openai:text-embedding-3-small", dimensions: 1536 },
};

function fakeFetch(status: number, body: unknown): typeof fetch {
  return (async () => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) })) as unknown as typeof fetch;
}

describe("fetchCorpusSnapshot", () => {
  it("keeps titles, chunk counts, totals and provider meta", async () => {
    await expect(fetchCorpusSnapshot("https://x", fakeFetch(200, stats))).resolves.toEqual({
      documents: [{ title: "Doc A", chunkCount: 30 }],
      totalChunks: 30,
      corpusMeta: { providerId: "openai:text-embedding-3-small", dimensions: 1536 },
    });
  });
  it("returns null on a non-200", async () => {
    await expect(fetchCorpusSnapshot("https://x", fakeFetch(503, {}))).resolves.toBeNull();
  });
});

describe("buildProvenance", () => {
  it("fills every field and leaves rescoring fields null", () => {
    const p = buildProvenance({
      targetUrl: "https://x", git: { gitCommit: "abc", gitDirty: false }, bankVersion: "v1", bankHash: "sha256:00",
      split: "test", runs: 3, questionCount: 34, partial: false, corpus: null, now: new Date("2026-08-28T12:00:00Z"),
    });
    expect(p).toEqual({
      harnessVersion: 1, timestamp: "2026-08-28T12:00:00.000Z", targetUrl: "https://x", gitCommit: "abc", gitDirty: false,
      bankVersion: "v1", bankHash: "sha256:00", split: "test", runs: 3, questionCount: 34, partial: false, corpus: null,
      rescoredFrom: null, originalBankHash: null,
    });
  });
});
