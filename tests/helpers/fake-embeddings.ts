import type { EmbeddingProvider } from "../../src/lib/embeddings/provider";

const DIMENSIONS = 1536;

function hashVector(text: string): number[] {
  const v = new Array<number>(DIMENSIONS).fill(0);
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    v[Math.abs(h) % DIMENSIONS] += 1;
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

export function basisVector(position: number): number[] {
  const v = new Array<number>(DIMENSIONS).fill(0);
  v[position] = 1;
  return v;
}

export class FakeEmbeddingProvider implements EmbeddingProvider {
  readonly id = "fake:deterministic";
  readonly dimensions = DIMENSIONS;

  constructor(private readonly preset: Map<string, number[]> = new Map()) {}

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => this.preset.get(t) ?? hashVector(t));
  }
}
