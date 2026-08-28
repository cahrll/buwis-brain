import type { Usage } from "./types";

export interface Rates {
  inputPerMTok: number;
  outputPerMTok: number;
}

// First-party API rates in USD per million tokens; matched by prefix so dated ids still price
export const PRICING: Record<string, Rates> = {
  "claude-opus-5": { inputPerMTok: 5, outputPerMTok: 25 },
  "claude-opus-4-8": { inputPerMTok: 5, outputPerMTok: 25 },
  "claude-opus-4-7": { inputPerMTok: 5, outputPerMTok: 25 },
  "claude-sonnet-5": { inputPerMTok: 2, outputPerMTok: 10 },
  "claude-sonnet-4-6": { inputPerMTok: 3, outputPerMTok: 15 },
  "claude-haiku-4-5": { inputPerMTok: 1, outputPerMTok: 5 },
};

export function ratesFor(model: string): Rates | null {
  const key = Object.keys(PRICING)
    .filter((k) => model.startsWith(k))
    .sort((a, b) => b.length - a.length)[0];
  return key ? PRICING[key] : null;
}

export function priceUsd(usage: Usage | null): number | null {
  if (usage === null) return 0;
  const rates = ratesFor(usage.model);
  if (!rates) return null;
  return (usage.inputTokens * rates.inputPerMTok + usage.outputTokens * rates.outputPerMTok) / 1_000_000;
}
