import { describe, expect, it } from "vitest";
import {
  chunkMarkdownSections,
  chunkPdfPages,
  countTokens,
} from "../../src/lib/ingest/chunk";

const SENTENCE =
  "The taxpayer shall file the quarterly income tax return on or before the deadline. ";

describe("chunkPdfPages", () => {
  it("returns [] for empty input", () => {
    expect(chunkPdfPages([])).toEqual([]);
  });

  it("emits one chunk for a short page with page metadata", () => {
    const chunks = chunkPdfPages([{ pageNumber: 4, text: SENTENCE }]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].ord).toBe(0);
    expect(chunks[0].pageStart).toBe(4);
    expect(chunks[0].pageEnd).toBe(4);
    expect(chunks[0].heading).toBeNull();
    expect(chunks[0].tokenCount).toBe(countTokens(chunks[0].content));
  });

  it("splits long text into <=500-token chunks with overlap", () => {
    const long = SENTENCE.repeat(200); // ~3200 tokens, one giant paragraph
    const chunks = chunkPdfPages([{ pageNumber: 1, text: long }]);
    expect(chunks.length).toBeGreaterThan(3);
    for (const c of chunks) expect(c.tokenCount).toBeLessThanOrEqual(500);
    const tail = chunks[0].content.slice(-40);
    expect(chunks[1].content).toContain(tail.slice(0, 20));
    expect(chunks.map((c) => c.ord)).toEqual(chunks.map((_, i) => i));
  });

  it("spans pages and records the range", () => {
    const pages = [
      { pageNumber: 1, text: SENTENCE.repeat(10) },
      { pageNumber: 2, text: SENTENCE.repeat(10) },
    ];
    const chunks = chunkPdfPages(pages);
    const spanning = chunks.find((c) => c.pageStart === 1 && c.pageEnd === 2);
    expect(spanning).toBeDefined();
  });

  it("normalizes whitespace and drops near-empty pages", () => {
    const chunks = chunkPdfPages([
      { pageNumber: 1, text: "  \n\n  " },
      {
        pageNumber: 2,
        text: "Income   tax\n\nrates    apply to professionals and freelancers earning income.",
      },
    ]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toContain("Income tax");
    expect(chunks[0].content).not.toMatch(/ {2,}/);
  });

  it("drops noise fragments below MIN_CHUNK_TOKENS", () => {
    const chunks = chunkPdfPages([{ pageNumber: 3, text: "Page 3" }]);
    expect(chunks).toEqual([]);
  });
});

describe("chunkMarkdownSections", () => {
  it("keeps heading trail and never mixes sections", () => {
    const chunks = chunkMarkdownSections([
      {
        headingTrail: "SSS > Voluntary Members",
        text: "Voluntary members pay monthly contributions based on declared earnings.",
      },
      {
        headingTrail: "SSS > Deadlines",
        text: "Payment deadlines follow the schedule set by the SSS for each quarter.",
      },
    ]);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].heading).toBe("SSS > Voluntary Members");
    expect(chunks[1].heading).toBe("SSS > Deadlines");
    expect(chunks[0].content).not.toContain("deadlines follow");
    expect(chunks.map((c) => c.ord)).toEqual([0, 1]);
    expect(chunks[0].pageStart).toBeNull();
  });
});
