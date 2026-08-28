import { describe, expect, it } from "vitest";
import { priceUsd, ratesFor } from "../../evals/src/pricing";

describe("priceUsd", () => {
  it("prices Opus 5 at 5 and 25 dollars per million", () => {
    expect(priceUsd({ model: "claude-opus-5", inputTokens: 1_000_000, outputTokens: 100_000 })).toBeCloseTo(7.5, 10);
  });
  it("matches dated ids by prefix", () => {
    expect(ratesFor("claude-sonnet-5-20260901")).toEqual({ inputPerMTok: 2, outputPerMTok: 10 });
  });
  it("returns 0 for a gate refusal and null for an unknown model", () => {
    expect(priceUsd(null)).toBe(0);
    expect(priceUsd({ model: "gpt-9", inputTokens: 10, outputTokens: 10 })).toBeNull();
  });
});
