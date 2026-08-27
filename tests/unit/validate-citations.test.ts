import { describe, expect, it } from "vitest";
import { reconcileCitations } from "../../src/lib/answer/validate-citations";

const CONTEXT = 8;

describe("reconcileCitations", () => {
  it("forces refusals to zero citations", () => {
    const out = reconcileCitations(
      { refused: true, reason: "not_covered", answer: "ignored", citations: [1, 2] },
      CONTEXT,
    );
    expect(out).toEqual({ refused: true, reason: "not_covered", answer: null, citations: [] });
  });

  it("defaults a refusal reason when the model gives none", () => {
    const out = reconcileCitations(
      { refused: true, reason: null, answer: null, citations: [] },
      CONTEXT,
    );
    expect(out.reason).toBe("not_answerable");
  });

  it("passes through a clean answer", () => {
    const out = reconcileCitations(
      { refused: false, reason: null, answer: "File quarterly [1] and annually [2].", citations: [1, 2] },
      CONTEXT,
    );
    expect(out.refused).toBe(false);
    expect(out.answer).toBe("File quarterly [1] and annually [2].");
    expect(out.citations).toEqual([1, 2]);
  });

  it("unions valid inline markers missing from the citations array", () => {
    const out = reconcileCitations(
      { refused: false, reason: null, answer: "Pay by the deadline [3].", citations: [] },
      CONTEXT,
    );
    expect(out.refused).toBe(false);
    expect(out.citations).toEqual([3]);
  });

  it("strips out-of-range inline markers from the answer text", () => {
    const out = reconcileCitations(
      { refused: false, reason: null, answer: "True claim [1]. Phantom [12].", citations: [1] },
      CONTEXT,
    );
    expect(out.answer).toBe("True claim [1]. Phantom .");
    expect(out.citations).toEqual([1]);
  });

  it("drops out-of-range array entries and dedupes", () => {
    const out = reconcileCitations(
      { refused: false, reason: null, answer: "Claim [2] again [2].", citations: [2, 2, 9, 0, -1] },
      CONTEXT,
    );
    expect(out.citations).toEqual([2]);
  });

  it("downgrades to unsupported_answer only after reconciliation", () => {
    const out = reconcileCitations(
      { refused: false, reason: null, answer: "Only phantom support [12].", citations: [12] },
      CONTEXT,
    );
    expect(out).toEqual({ refused: true, reason: "unsupported_answer", answer: null, citations: [] });
  });

  it("downgrades an empty answer", () => {
    const out = reconcileCitations(
      { refused: false, reason: null, answer: "   ", citations: [1] },
      CONTEXT,
    );
    expect(out.refused).toBe(true);
    expect(out.reason).toBe("unsupported_answer");
  });
});
