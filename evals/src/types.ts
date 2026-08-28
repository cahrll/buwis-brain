import { z } from "zod";

export const HARNESS_VERSION = 1;

export const CATEGORIES = [
  "on_corpus_bir", "on_corpus_sss", "on_corpus_philhealth", "on_corpus_pagibig",
  "deep_nirc", "currency_trap", "off_corpus", "borderline",
] as const;
export const EXPECTATIONS = ["answer", "refuse", "either"] as const;
export const SPLITS = ["dev", "test"] as const;
export const OUTCOMES = ["answered", "refused_gate", "refused_model", "error"] as const;
export const SELECTORS = ["dev", "test", "all", "questions"] as const;

export type Category = (typeof CATEGORIES)[number];
export type Expectation = (typeof EXPECTATIONS)[number];
export type Outcome = (typeof OUTCOMES)[number];
export type Selector = (typeof SELECTORS)[number];

// Own copy of the /api/ask debug shape: the harness is a client and never imports src/
export const UsageSchema = z.object({
  model: z.string(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
});
export const CitationSchema = z.object({
  index: z.number().int(),
  chunkId: z.string(),
  documentTitle: z.string(),
  pageStart: z.number().int().nullable(),
  pageEnd: z.number().int().nullable(),
  heading: z.string().nullable(),
  content: z.string(),
});
export const DiagnosticChunkSchema = z.object({
  chunkId: z.string(),
  documentTitle: z.string(),
  vectorRank: z.number().int().nullable(),
  keywordRank: z.number().int().nullable(),
  similarity: z.number().nullable(),
  rrfScore: z.number(),
});
export const DiagnosticsSchema = z.object({
  chunks: z.array(DiagnosticChunkSchema),
  bestSimilarity: z.number(),
  simFloor: z.number(),
  usage: UsageSchema.nullable(),
});
export const AskResponseSchema = z.object({
  refused: z.boolean(),
  reason: z.string().nullable(),
  answer: z.string().nullable(),
  citations: z.array(CitationSchema),
  latencyMs: z.number(),
  diagnostics: DiagnosticsSchema,
});
export type Usage = z.infer<typeof UsageSchema>;
export type AskResponse = z.infer<typeof AskResponseSchema>;

const slug = z.string().regex(/^[a-z0-9-]+$/);

export const DocumentEntrySchema = z.object({
  title: z.string().min(1),
  agency: z.string().min(1),
  short: z.string().min(1),
});
export const DocumentRegistrySchema = z.record(slug, DocumentEntrySchema);
export const SupersededBySchema = z.object({
  rule: z.string().min(1),
  effective: z.string().min(1),
  change: z.string().min(1),
});
export const QuestionEntrySchema = z
  .object({
    id: slug,
    question: z.string().min(1),
    category: z.enum(CATEGORIES),
    expected: z.enum(EXPECTATIONS),
    expectedDocs: z.array(slug).default([]),
    split: z.enum(SPLITS),
    currencyTrap: z.literal(true).optional(),
    supersededBy: SupersededBySchema.optional(),
    tags: z.array(slug).default([]),
    notes: z.string().optional(),
  })
  .superRefine((e, ctx) => {
    if (e.expected === "answer" && e.expectedDocs.length === 0) {
      ctx.addIssue({ code: "custom", message: `${e.id}: answer entries need expectedDocs` });
    }
    if (e.expected === "refuse" && e.expectedDocs.length > 0) {
      ctx.addIssue({ code: "custom", message: `${e.id}: refuse entries must not list expectedDocs` });
    }
    const trap = e.category === "currency_trap";
    if (trap !== (e.currencyTrap === true) || trap !== (e.supersededBy !== undefined)) {
      ctx.addIssue({ code: "custom", message: `${e.id}: currency_trap, currencyTrap and supersededBy imply each other` });
    }
  });
export const QuestionBankSchema = z.object({
  version: z.string().min(1),
  entries: z.array(QuestionEntrySchema).min(1),
});
export type DocumentRegistry = z.infer<typeof DocumentRegistrySchema>;
export type SupersededBy = z.infer<typeof SupersededBySchema>;
export type QuestionEntry = z.infer<typeof QuestionEntrySchema>;
export type QuestionBank = z.infer<typeof QuestionBankSchema>;

export const RowSchema = z.object({
  questionId: z.string(),
  run: z.number().int().positive(),
  category: z.enum(CATEGORIES),
  expected: z.enum(EXPECTATIONS),
  outcome: z.enum(OUTCOMES),
  refused: z.boolean().nullable(),
  reason: z.string().nullable(),
  answer: z.string().nullable(),
  citedDocs: z.array(z.string()),
  retrievedDocs: z.array(z.string()),
  bestSimilarity: z.number().nullable(),
  latencyMs: z.number().nullable(),
  roundTripMs: z.number(),
  usage: UsageSchema.nullable(),
  usd: z.number().nullable(),
  error: z.string().nullable(),
  response: AskResponseSchema.nullable(),
});
export type Row = z.infer<typeof RowSchema>;

export const CorpusSnapshotSchema = z.object({
  documents: z.array(z.object({ title: z.string(), chunkCount: z.number().int() })),
  totalChunks: z.number().int(),
  corpusMeta: z.object({ providerId: z.string(), dimensions: z.number().int() }).nullable(),
});
export type CorpusSnapshot = z.infer<typeof CorpusSnapshotSchema>;

export const ProvenanceSchema = z.object({
  harnessVersion: z.number().int(),
  timestamp: z.string(),
  targetUrl: z.string(),
  gitCommit: z.string(),
  gitDirty: z.boolean(),
  bankVersion: z.string(),
  bankHash: z.string(),
  split: z.enum(SELECTORS),
  runs: z.number().int().positive(),
  questionCount: z.number().int().nonnegative(),
  partial: z.boolean(),
  corpus: CorpusSnapshotSchema.nullable(),
  rescoredFrom: z.string().nullable(),
  originalBankHash: z.string().nullable(),
});
export type Provenance = z.infer<typeof ProvenanceSchema>;

const Rate = z.number().nullable();
export const RetrievalBlockSchema = z.object({
  anyHitRate: Rate, allExpectedDocsRate: Rate, citedHitRate: Rate,
});
export const RefusalBlockSchema = z.object({
  correctRefusalRate: Rate, correctRefusalAtGateRate: Rate, offCorpusReachedLlmRate: Rate,
  falseRefusalRate: Rate, falseRefusalAtGateRate: Rate, falseRefusalByModelRate: Rate,
});
export const StabilityBlockSchema = z.object({ behaviorStabilityRate: Rate, docSetStabilityRate: Rate });
export const LatencyBlockSchema = z.object({
  server: z.object({ p50: Rate, p95: Rate }),
  roundTrip: z.object({ p50: Rate, p95: Rate }),
  byOutcome: z.object({ answered: z.object({ p50: Rate }), refused: z.object({ p50: Rate }) }),
});
export const CostBlockSchema = z.object({
  meanInputTokens: Rate, meanOutputTokens: Rate, meanUsdPerQuestion: Rate, meanUsdPerLlmCall: Rate,
  totalUsd: Rate, unpricedLlmCalls: z.number().int(), models: z.array(z.string()),
});
export const KeywordLegBlockSchema = z.object({ chunkShare: Rate, questionShare: Rate });
export const SimilarityStatsSchema = z.object({ min: Rate, median: Rate, max: Rate });
export const BreakdownSchema = z.object({
  retrieval: RetrievalBlockSchema, refusal: RefusalBlockSchema,
  stability: StabilityBlockSchema, latency: LatencyBlockSchema,
});
export const AggregatesSchema = z.object({
  counts: z.object({ rows: z.number().int(), errors: z.number().int(), llmCalls: z.number().int(), errorRate: Rate }),
  retrieval: RetrievalBlockSchema,
  refusal: RefusalBlockSchema,
  stability: StabilityBlockSchema,
  latency: LatencyBlockSchema,
  cost: CostBlockSchema,
  keywordLeg: KeywordLegBlockSchema,
  similarity: z.object({ answer: SimilarityStatsSchema, refuse: SimilarityStatsSchema }),
  byCategory: z.record(z.string(), BreakdownSchema),
  byTag: z.record(z.string(), BreakdownSchema),
});
export type Aggregates = z.infer<typeof AggregatesSchema>;
export type Breakdown = z.infer<typeof BreakdownSchema>;

export const FlagsSchema = z.object({
  unstableQuestions: z.array(z.object({
    questionId: z.string(),
    outcomes: z.array(z.object({ run: z.number().int(), outcome: z.enum(OUTCOMES), citedDocs: z.array(z.string()) })),
  })),
  falseRefusals: z.array(z.object({ questionId: z.string(), run: z.number().int(), outcome: z.enum(OUTCOMES), reason: z.string().nullable() })),
  missedRefusals: z.array(z.object({ questionId: z.string(), run: z.number().int(), citedDocs: z.array(z.string()) })),
  retrievalMisses: z.array(z.object({ questionId: z.string(), run: z.number().int(), expectedDocs: z.array(z.string()), retrievedDocs: z.array(z.string()) })),
  currencyTrapAnswers: z.array(z.object({ questionId: z.string(), run: z.number().int(), answer: z.string(), supersededBy: SupersededBySchema })),
  unknownTitles: z.array(z.string()),
});
export type Flags = z.infer<typeof FlagsSchema>;

export const ResultsFileSchema = z.object({
  provenance: ProvenanceSchema,
  aggregates: AggregatesSchema,
  flags: FlagsSchema,
  rows: z.array(RowSchema),
});
export type ResultsFile = z.infer<typeof ResultsFileSchema>;
