import { describe, expect, it } from "vitest";
import { fuseRrf } from "../../src/lib/retrieval/rrf";

describe("fuseRrf", () => {
  it("returns [] for two empty legs", () => {
    expect(fuseRrf([], [])).toEqual([]);
  });

  it("scores 1/(60+rank) per leg and sums across legs", () => {
    const fused = fuseRrf(["a", "b"], ["b", "c"]);
    const byId = new Map(fused.map((e) => [e.id, e]));
    expect(byId.get("a")!.score).toBeCloseTo(1 / 61, 10);
    expect(byId.get("b")!.score).toBeCloseTo(1 / 62 + 1 / 61, 10);
    expect(byId.get("c")!.score).toBeCloseTo(1 / 62, 10);
    expect(fused[0].id).toBe("b"); // appears in both legs -> highest
  });

  it("records per-leg 1-based ranks with null for absent legs", () => {
    const fused = fuseRrf(["a", "b"], ["b"]);
    const byId = new Map(fused.map((e) => [e.id, e]));
    expect(byId.get("a")).toMatchObject({ vectorRank: 1, keywordRank: null });
    expect(byId.get("b")).toMatchObject({ vectorRank: 2, keywordRank: 1 });
  });

  it("breaks score ties deterministically by id", () => {
    const fused = fuseRrf(["b"], ["a"]); // both rank 1 -> equal scores
    expect(fused.map((e) => e.id)).toEqual(["a", "b"]);
  });
});
