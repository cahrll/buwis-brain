import type { Pool } from "pg";
import { reconcileCitations } from "./answer/validate-citations";
import type { UsageInfo } from "./answer/schema";
import type { SynthesizeFn } from "./answer/synthesize";
import type { EmbeddingProvider } from "./embeddings/provider";
import { simFloor } from "./env";
import { shouldRefuse } from "./retrieval/confidence-gate";
import { keywordSearch } from "./retrieval/keyword-search";
import { fuseRrf } from "./retrieval/rrf";
import type { RetrievedChunk } from "./retrieval/types";
import { vectorSearch } from "./retrieval/vector-search";

const LEG_LIMIT = 20;
const CONTEXT_SIZE = 8;

export interface AskDeps {
  pool: Pool;
  provider: EmbeddingProvider;
  synthesizeFn: SynthesizeFn;
}

export interface AskInput {
  question: string;
  debug?: boolean;
}

export interface CitationOut {
  index: number;
  chunkId: string;
  documentTitle: string;
  pageStart: number | null;
  pageEnd: number | null;
  heading: string | null;
  content: string;
}

export interface DiagnosticsOut {
  chunks: {
    chunkId: string;
    documentTitle: string;
    vectorRank: number | null;
    keywordRank: number | null;
    similarity: number | null;
    rrfScore: number;
  }[];
  bestSimilarity: number;
  simFloor: number;
  usage: UsageInfo | null;
}

export interface AskResponseBody {
  refused: boolean;
  reason: string | null;
  answer: string | null;
  citations: CitationOut[];
  latencyMs: number;
  diagnostics?: DiagnosticsOut;
}

export async function askQuestion(deps: AskDeps, input: AskInput): Promise<AskResponseBody> {
  const started = Date.now();
  const [queryEmbedding] = await deps.provider.embed([input.question]);
  const [vectorHits, keywordHits] = await Promise.all([
    vectorSearch(deps.pool, queryEmbedding, LEG_LIMIT),
    keywordSearch(deps.pool, input.question, LEG_LIMIT),
  ]);

  const fused = fuseRrf(vectorHits.map((h) => h.id), keywordHits.map((h) => h.id));
  const top = fused.slice(0, CONTEXT_SIZE);

  const byId = new Map<string, RetrievedChunk>();
  for (const h of vectorHits) byId.set(h.id, h);
  for (const h of keywordHits) if (!byId.has(h.id)) byId.set(h.id, h);
  const simById = new Map(vectorHits.map((h) => [h.id, h.similarity]));

  const bestSimilarity = vectorHits[0]?.similarity ?? 0;
  const floor = simFloor();
  const diagnostics: DiagnosticsOut | undefined = input.debug
    ? {
        chunks: top.map((e) => ({
          chunkId: e.id,
          documentTitle: byId.get(e.id)!.documentTitle,
          vectorRank: e.vectorRank,
          keywordRank: e.keywordRank,
          similarity: simById.get(e.id) ?? null,
          rrfScore: e.score,
        })),
        bestSimilarity,
        simFloor: floor,
        usage: null,
      }
    : undefined;

  const respond = (
    body: Omit<AskResponseBody, "latencyMs" | "diagnostics">,
  ): AskResponseBody => ({
    ...body,
    latencyMs: Date.now() - started,
    ...(diagnostics ? { diagnostics } : {}),
  });

  if (shouldRefuse({ fusedCount: fused.length, bestSimilarity, floor })) {
    return respond({ refused: true, reason: "low_confidence", answer: null, citations: [] });
  }

  const contextChunks = top.map((e) => byId.get(e.id)!);
  const model = await deps.synthesizeFn(contextChunks, input.question);
  if (diagnostics) diagnostics.usage = model.usage ?? null;
  const reconciled = reconcileCitations(model, contextChunks.length);
  const citations: CitationOut[] = reconciled.citations.map((n) => {
    const c = contextChunks[n - 1];
    return {
      index: n,
      chunkId: c.id,
      documentTitle: c.documentTitle,
      pageStart: c.pageStart,
      pageEnd: c.pageEnd,
      heading: c.heading,
      content: c.content,
    };
  });
  return respond({
    refused: reconciled.refused,
    reason: reconciled.reason,
    answer: reconciled.answer,
    citations,
  });
}
