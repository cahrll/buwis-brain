import { mapTitles } from "./bank";
import { ask as defaultAsk, type AskOptions, type AskResult } from "./client";
import { priceUsd } from "./pricing";
import { outcomeOf } from "./score";
import type { QuestionEntry, Row } from "./types";

// Nonsense that scores far below the floor: warms the function without an LLM call
export const WARM_UP_QUESTION = "zxqv plorth wumble kraddle";

export interface CollectOptions {
  baseUrl: string;
  entries: QuestionEntry[];
  runs: number;
  titleToKey: Map<string, string>;
  ask?: typeof defaultAsk;
  askOptions?: AskOptions;
  onRow: (row: Row) => void;
  onProgress?: (line: string) => void;
  shouldStop?: () => boolean;
}

export function toRow(entry: QuestionEntry, run: number, result: AskResult, titleToKey: Map<string, string>): Row {
  const base = { questionId: entry.id, run, category: entry.category, expected: entry.expected };
  if (!result.ok) {
    return {
      ...base, outcome: "error", refused: null, reason: null, answer: null, citedDocs: [], retrievedDocs: [],
      bestSimilarity: null, latencyMs: null, roundTripMs: result.roundTripMs, usage: null, usd: null,
      error: result.error, response: null,
    };
  }
  const r = result.response;
  const usage = r.diagnostics.usage;
  return {
    ...base,
    outcome: outcomeOf(r.refused, r.reason),
    refused: r.refused,
    reason: r.reason,
    answer: r.answer,
    citedDocs: mapTitles(r.citations.map((c) => c.documentTitle), titleToKey).keys,
    retrievedDocs: mapTitles(r.diagnostics.chunks.map((c) => c.documentTitle), titleToKey).keys,
    bestSimilarity: r.diagnostics.bestSimilarity,
    latencyMs: r.latencyMs,
    roundTripMs: result.roundTripMs,
    usage,
    usd: priceUsd(usage),
    error: null,
    response: r,
  };
}

export function progressLine(run: number, runs: number, index: number, total: number, entry: QuestionEntry, row: Row): string {
  const hit = entry.expectedDocs.length === 0
    ? "-"
    : entry.expectedDocs.some((d) => row.retrievedDocs.includes(d)) ? "hit" : "miss";
  const ms = String(row.latencyMs ?? row.roundTripMs);
  return `[run ${run}/${runs}] ${String(index).padStart(2)}/${total} ${entry.id.padEnd(34)} ${row.outcome.padEnd(13)} ${ms.padStart(6)} ms  ${hit}`;
}

export async function collect(opts: CollectOptions): Promise<{ partial: boolean }> {
  const askFn = opts.ask ?? defaultAsk;
  await askFn(opts.baseUrl, WARM_UP_QUESTION, opts.askOptions);
  for (let run = 1; run <= opts.runs; run += 1) {
    for (let i = 0; i < opts.entries.length; i += 1) {
      if (opts.shouldStop?.()) return { partial: true };
      const entry = opts.entries[i];
      const result = await askFn(opts.baseUrl, entry.question, opts.askOptions);
      const row = toRow(entry, run, result, opts.titleToKey);
      opts.onRow(row);
      opts.onProgress?.(progressLine(run, opts.runs, i + 1, opts.entries.length, entry, row));
    }
  }
  return { partial: false };
}
