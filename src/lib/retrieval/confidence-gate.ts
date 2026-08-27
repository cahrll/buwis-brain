export interface GateInput {
  fusedCount: number;
  bestSimilarity: number;
  floor: number;
}

export function shouldRefuse(input: GateInput): boolean {
  return input.fusedCount === 0 || input.bestSimilarity < input.floor;
}
