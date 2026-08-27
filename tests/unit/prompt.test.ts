import { describe, expect, it } from "vitest";
import { buildUserMessage, SYSTEM_PROMPT } from "../../src/lib/answer/prompt";
import type { RetrievedChunk } from "../../src/lib/retrieval/types";

const chunk = (over: Partial<RetrievedChunk>): RetrievedChunk => ({
  id: "c1", documentId: "d1", documentTitle: "BIR Guide", content: "text",
  pageStart: null, pageEnd: null, heading: null, ...over,
});

describe("prompt", () => {
  it("system prompt pins the refusal and citation duties", () => {
    expect(SYSTEM_PROMPT).toMatch(/only.*context/i);
    expect(SYSTEM_PROMPT).toMatch(/refus/i);
    expect(SYSTEM_PROMPT).toMatch(/\[n\]/);
  });

  it("numbers chunks from 1 with page metadata", () => {
    const msg = buildUserMessage(
      [chunk({ content: "alpha", pageStart: 3, pageEnd: 4 }), chunk({ id: "c2", content: "beta", heading: "SSS > Deadlines" })],
      "When are payments due?",
    );
    expect(msg).toContain("[1] (BIR Guide, pages 3-4)");
    expect(msg).toContain("alpha");
    expect(msg).toContain("[2] (BIR Guide, SSS > Deadlines)");
    expect(msg).toContain("Question: When are payments due?");
    expect(msg.indexOf("[1]")).toBeLessThan(msg.indexOf("[2]"));
  });
});
