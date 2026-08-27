import { describe, expect, it } from "vitest";
import { shouldRefuse } from "../../src/lib/retrieval/confidence-gate";

describe("shouldRefuse", () => {
  it("refuses when nothing was retrieved", () => {
    expect(shouldRefuse({ fusedCount: 0, bestSimilarity: 0.9, floor: 0.3 })).toBe(true);
  });

  it("refuses below the floor", () => {
    expect(shouldRefuse({ fusedCount: 5, bestSimilarity: 0.29, floor: 0.3 })).toBe(true);
  });

  it("passes at or above the floor", () => {
    expect(shouldRefuse({ fusedCount: 5, bestSimilarity: 0.3, floor: 0.3 })).toBe(false);
    expect(shouldRefuse({ fusedCount: 5, bestSimilarity: 0.8, floor: 0.3 })).toBe(false);
  });
});
