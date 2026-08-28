import { mapTitles, type LoadedBank } from "./bank";
import { priceUsd } from "./pricing";
import type { Aggregates, Breakdown, Flags, Outcome, QuestionEntry, Row } from "./types";

export function nearestRank(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
}

export function rate(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function mean(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;
}

export function outcomeOf(refused: boolean, reason: string | null): Outcome {
  if (!refused) return "answered";
  return reason === "low_confidence" ? "refused_gate" : "refused_model";
}

// Re-derive from the raw response so a rescore against an edited registry stays honest
export function deriveRow(row: Row, titleToKey: Map<string, string>): Row {
  if (!row.response) return row;
  const r = row.response;
  return {
    ...row,
    outcome: outcomeOf(r.refused, r.reason),
    retrievedDocs: mapTitles(r.diagnostics.chunks.map((c) => c.documentTitle), titleToKey).keys,
    citedDocs: mapTitles(r.citations.map((c) => c.documentTitle), titleToKey).keys,
    usd: priceUsd(r.diagnostics.usage),
  };
}

interface Scored {
  row: Row;
  entry: QuestionEntry;
}

const okOnly = (items: Scored[]) => items.filter((s) => s.row.outcome !== "error");
const hasExpected = (s: Scored, docs: string[]) => s.entry.expectedDocs.some((d) => docs.includes(d));

function retrievalBlock(items: Scored[]): Aggregates["retrieval"] {
  const withDocs = okOnly(items).filter((s) => s.entry.expectedDocs.length > 0);
  const anyHit = withDocs.filter((s) => hasExpected(s, s.row.retrievedDocs));
  const multi = withDocs.filter((s) => s.entry.expectedDocs.length >= 2);
  const allHit = multi.filter((s) => s.entry.expectedDocs.every((d) => s.row.retrievedDocs.includes(d)));
  const answered = withDocs.filter((s) => s.row.outcome === "answered");
  const citedHit = answered.filter((s) => hasExpected(s, s.row.citedDocs));
  return {
    anyHitRate: rate(anyHit.length, withDocs.length),
    allExpectedDocsRate: rate(allHit.length, multi.length),
    citedHitRate: rate(citedHit.length, answered.length),
  };
}

function refusalBlock(items: Scored[]): Aggregates["refusal"] {
  const ok = okOnly(items);
  const shouldRefuse = ok.filter((s) => s.entry.expected === "refuse");
  const refused = shouldRefuse.filter((s) => s.row.refused === true);
  const atGate = refused.filter((s) => s.row.outcome === "refused_gate");
  const reachedLlm = shouldRefuse.filter((s) => s.row.outcome !== "refused_gate");
  const shouldAnswer = ok.filter((s) => s.entry.expected === "answer");
  const falseRefused = shouldAnswer.filter((s) => s.row.refused === true);
  const falseAtGate = falseRefused.filter((s) => s.row.outcome === "refused_gate");
  const falseByModel = falseRefused.filter((s) => s.row.outcome === "refused_model");
  return {
    correctRefusalRate: rate(refused.length, shouldRefuse.length),
    correctRefusalAtGateRate: rate(atGate.length, shouldRefuse.length),
    offCorpusReachedLlmRate: rate(reachedLlm.length, shouldRefuse.length),
    falseRefusalRate: rate(falseRefused.length, shouldAnswer.length),
    falseRefusalAtGateRate: rate(falseAtGate.length, shouldAnswer.length),
    falseRefusalByModelRate: rate(falseByModel.length, shouldAnswer.length),
  };
}

function groupByQuestion(items: Scored[]): Map<string, Scored[]> {
  const groups = new Map<string, Scored[]>();
  for (const s of items) {
    const group = groups.get(s.entry.id) ?? [];
    group.push(s);
    groups.set(s.entry.id, group);
  }
  return groups;
}

const docSetKey = (docs: string[]) => [...docs].sort().join("|");

function stabilityBlock(
  items: Scored[],
  runs: number,
): { block: Aggregates["stability"]; unstable: Flags["unstableQuestions"] } {
  const unstable: Flags["unstableQuestions"] = [];
  if (runs < 2) return { block: { behaviorStabilityRate: null, docSetStabilityRate: null }, unstable };
  let scored = 0;
  let behaviorStable = 0;
  let allAnswered = 0;
  let docStable = 0;
  for (const [questionId, group] of groupByQuestion(items)) {
    if (group.length < 2 || group.some((s) => s.row.outcome === "error")) continue;
    scored += 1;
    if (new Set(group.map((s) => s.row.refused)).size === 1) {
      behaviorStable += 1;
    } else {
      unstable.push({
        questionId,
        outcomes: group.map((s) => ({ run: s.row.run, outcome: s.row.outcome, citedDocs: s.row.citedDocs })),
      });
    }
    if (group.every((s) => s.row.outcome === "answered")) {
      allAnswered += 1;
      if (new Set(group.map((s) => docSetKey(s.row.citedDocs))).size === 1) docStable += 1;
    }
  }
  return {
    block: { behaviorStabilityRate: rate(behaviorStable, scored), docSetStabilityRate: rate(docStable, allAnswered) },
    unstable,
  };
}

const serverLatencies = (items: Scored[]) =>
  items.map((s) => s.row.latencyMs).filter((v): v is number => v !== null);

function latencyBlock(items: Scored[]): Aggregates["latency"] {
  const ok = okOnly(items);
  const server = serverLatencies(ok);
  const roundTrip = ok.map((s) => s.row.roundTripMs);
  const answered = serverLatencies(ok.filter((s) => s.row.outcome === "answered"));
  const refused = serverLatencies(ok.filter((s) => s.row.refused === true));
  return {
    server: { p50: nearestRank(server, 0.5), p95: nearestRank(server, 0.95) },
    roundTrip: { p50: nearestRank(roundTrip, 0.5), p95: nearestRank(roundTrip, 0.95) },
    byOutcome: { answered: { p50: nearestRank(answered, 0.5) }, refused: { p50: nearestRank(refused, 0.5) } },
  };
}

function costBlock(items: Scored[]): Aggregates["cost"] {
  const ok = okOnly(items);
  const llm = ok.filter((s) => s.row.usage !== null);
  const priced = ok.filter((s) => s.row.usd !== null);
  const pricedLlm = priced.filter((s) => s.row.usage !== null);
  return {
    meanInputTokens: mean(llm.map((s) => s.row.usage!.inputTokens)),
    meanOutputTokens: mean(llm.map((s) => s.row.usage!.outputTokens)),
    meanUsdPerQuestion: mean(priced.map((s) => s.row.usd!)),
    meanUsdPerLlmCall: mean(pricedLlm.map((s) => s.row.usd!)),
    totalUsd: priced.length === 0 ? null : priced.reduce((sum, s) => sum + s.row.usd!, 0),
    unpricedLlmCalls: llm.length - pricedLlm.length,
    models: [...new Set(llm.map((s) => s.row.usage!.model))],
  };
}

function keywordLegBlock(items: Scored[]): Aggregates["keywordLeg"] {
  const withResponse = items.filter((s) => s.row.response !== null);
  const chunks = withResponse.flatMap((s) => s.row.response!.diagnostics.chunks);
  const keywordChunks = chunks.filter((c) => c.keywordRank !== null);
  const questions = withResponse.filter((s) => s.row.response!.diagnostics.chunks.some((c) => c.keywordRank !== null));
  return {
    chunkShare: rate(keywordChunks.length, chunks.length),
    questionShare: rate(questions.length, withResponse.length),
  };
}

function similarityStats(items: Scored[], expected: "answer" | "refuse"): Aggregates["similarity"]["answer"] {
  const values = okOnly(items)
    .filter((s) => s.entry.expected === expected && s.row.bestSimilarity !== null)
    .map((s) => s.row.bestSimilarity!);
  if (values.length === 0) return { min: null, median: null, max: null };
  return { min: Math.min(...values), median: nearestRank(values, 0.5), max: Math.max(...values) };
}

function breakdown(items: Scored[], runs: number): Breakdown {
  return {
    retrieval: retrievalBlock(items),
    refusal: refusalBlock(items),
    stability: stabilityBlock(items, runs).block,
    latency: latencyBlock(items),
  };
}

function flagsFor(items: Scored[], unstable: Flags["unstableQuestions"], titleToKey: Map<string, string>): Flags {
  const ok = okOnly(items);
  const unknown = new Set<string>();
  for (const s of items) {
    if (!s.row.response) continue;
    const titles = [
      ...s.row.response.diagnostics.chunks.map((c) => c.documentTitle),
      ...s.row.response.citations.map((c) => c.documentTitle),
    ];
    for (const t of mapTitles(titles, titleToKey).unknown) unknown.add(t);
  }
  return {
    unstableQuestions: unstable,
    falseRefusals: ok
      .filter((s) => s.entry.expected === "answer" && s.row.refused === true)
      .map((s) => ({ questionId: s.entry.id, run: s.row.run, outcome: s.row.outcome, reason: s.row.reason })),
    missedRefusals: ok
      .filter((s) => s.entry.expected === "refuse" && s.row.outcome === "answered")
      .map((s) => ({ questionId: s.entry.id, run: s.row.run, citedDocs: s.row.citedDocs })),
    retrievalMisses: ok
      .filter((s) => s.entry.expectedDocs.length > 0 && !hasExpected(s, s.row.retrievedDocs))
      .map((s) => ({ questionId: s.entry.id, run: s.row.run, expectedDocs: s.entry.expectedDocs, retrievedDocs: s.row.retrievedDocs })),
    currencyTrapAnswers: ok
      .filter((s) => s.entry.currencyTrap === true && s.entry.supersededBy !== undefined && s.row.outcome === "answered")
      .map((s) => ({ questionId: s.entry.id, run: s.row.run, answer: s.row.answer ?? "", supersededBy: s.entry.supersededBy! })),
    unknownTitles: [...unknown],
  };
}

export function scoreRows(
  rows: Row[],
  bank: LoadedBank,
  runs: number,
): { aggregates: Aggregates; flags: Flags; skippedQuestionIds: string[] } {
  const byId = new Map(bank.bank.entries.map((e) => [e.id, e]));
  const items: Scored[] = [];
  const skipped = new Set<string>();
  for (const raw of rows) {
    const entry = byId.get(raw.questionId);
    if (!entry) {
      skipped.add(raw.questionId);
      continue;
    }
    items.push({ row: deriveRow(raw, bank.titleToKey), entry });
  }
  const errors = items.filter((s) => s.row.outcome === "error").length;
  const llmCalls = items.filter((s) => s.row.usage !== null).length;
  const stability = stabilityBlock(items, runs);
  const categories = [...new Set(items.map((s) => s.entry.category))];
  const tags = [...new Set(items.flatMap((s) => s.entry.tags))];
  return {
    aggregates: {
      counts: { rows: items.length, errors, llmCalls, errorRate: rate(errors, items.length) },
      retrieval: retrievalBlock(items),
      refusal: refusalBlock(items),
      stability: stability.block,
      latency: latencyBlock(items),
      cost: costBlock(items),
      keywordLeg: keywordLegBlock(items),
      similarity: { answer: similarityStats(items, "answer"), refuse: similarityStats(items, "refuse") },
      byCategory: Object.fromEntries(categories.map((c) => [c, breakdown(items.filter((s) => s.entry.category === c), runs)])),
      byTag: Object.fromEntries(tags.map((t) => [t, breakdown(items.filter((s) => s.entry.tags.includes(t)), runs)])),
    },
    flags: flagsFor(items, stability.unstable, bank.titleToKey),
    skippedQuestionIds: [...skipped],
  };
}
