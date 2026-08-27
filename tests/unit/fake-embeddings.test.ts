import { describe, expect, it } from "vitest";
import { basisVector, FakeEmbeddingProvider } from "../helpers/fake-embeddings";

describe("FakeEmbeddingProvider", () => {
  it("is deterministic and unit-norm", async () => {
    const p = new FakeEmbeddingProvider();
    const [a1] = await p.embed(["hello"]);
    const [a2] = await p.embed(["hello"]);
    expect(a1).toEqual(a2);
    expect(a1).toHaveLength(1536);
    const norm = Math.sqrt(a1.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 6);
  });

  it("returns preset vectors when registered", async () => {
    const preset = new Map([["q", basisVector(3)]]);
    const p = new FakeEmbeddingProvider(preset);
    const [v] = await p.embed(["q"]);
    expect(v[3]).toBe(1);
  });
});
