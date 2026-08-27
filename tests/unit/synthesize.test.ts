import { describe, expect, it, vi } from "vitest";
import { answerEffort, answerModel } from "../../src/lib/env";
import { synthesize, SynthesisError } from "../../src/lib/answer/synthesize";
import type { RetrievedChunk } from "../../src/lib/retrieval/types";

const chunks: RetrievedChunk[] = [{
  id: "c1", documentId: "d1", documentTitle: "BIR Guide",
  content: "The 8% option applies to gross receipts.",
  pageStart: 1, pageEnd: 1, heading: null,
}];

function fakeClient(response: unknown) {
  const create = vi.fn().mockResolvedValue(response);
  return {
    client: { beta: { messages: { create } } } as unknown as Parameters<typeof synthesize>[2],
    create,
  };
}

describe("synthesize", () => {
  it("parses structured output into a ModelAnswer", async () => {
    const { client, create } = fakeClient({
      stop_reason: "end_turn",
      content: [{ type: "text", text: JSON.stringify({ refused: false, reason: null, answer: "Use the 8% option [1].", citations: [1] }) }],
    });
    const out = await synthesize(chunks, "Can I use the 8% option?", client);
    expect(out).toEqual({ refused: false, reason: null, answer: "Use the 8% option [1].", citations: [1] });

    const payload = create.mock.calls[0][0];
    expect(payload.model).toBe(answerModel());
    expect(payload.max_tokens).toBe(2048);
    expect(payload.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(payload.fallbacks).toBe("default");
    expect(payload.output_config.effort).toBe(answerEffort());
    expect(payload.output_config.format).toBeDefined();
  });

  it("maps stop_reason refusal to model_declined", async () => {
    const { client } = fakeClient({ stop_reason: "refusal", content: [] });
    const out = await synthesize(chunks, "q", client);
    expect(out).toEqual({ refused: true, reason: "model_declined", answer: null, citations: [] });
  });

  it("throws SynthesisError on malformed output", async () => {
    const { client } = fakeClient({
      stop_reason: "end_turn",
      content: [{ type: "text", text: "not json" }],
    });
    await expect(synthesize(chunks, "q", client)).rejects.toBeInstanceOf(SynthesisError);
  });

  it("throws SynthesisError when there is no text block", async () => {
    const { client } = fakeClient({ stop_reason: "end_turn", content: [] });
    await expect(synthesize(chunks, "q", client)).rejects.toBeInstanceOf(SynthesisError);
  });

  it("wraps a transport/API error in SynthesisError", async () => {
    const create = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    const client = { beta: { messages: { create } } } as unknown as Parameters<typeof synthesize>[2];
    await expect(synthesize(chunks, "q", client)).rejects.toBeInstanceOf(SynthesisError);
  });
});
