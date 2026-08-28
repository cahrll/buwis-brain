import { execFileSync } from "node:child_process";
import {
  CorpusSnapshotSchema, HARNESS_VERSION,
  type CorpusSnapshot, type Provenance, type Selector,
} from "./types";

export type Exec = (cmd: string, args: string[]) => string;

const defaultExec: Exec = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8" }).trim();

export function gitInfo(exec: Exec = defaultExec): { gitCommit: string; gitDirty: boolean } {
  try {
    const gitCommit = exec("git", ["rev-parse", "HEAD"]);
    const gitDirty = exec("git", ["status", "--porcelain"]).length > 0;
    return { gitCommit, gitDirty };
  } catch {
    return { gitCommit: "unknown", gitDirty: false };
  }
}

interface StatsBody {
  documents?: { title: string; chunkCount: number }[];
  totalChunks?: number;
  corpusMeta?: { providerId: string; dimensions: number } | null;
}

export async function fetchCorpusSnapshot(
  baseUrl: string,
  fetchFn: typeof fetch = fetch,
): Promise<CorpusSnapshot | null> {
  try {
    const res = await fetchFn(`${baseUrl}/api/stats`, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return null;
    const body = (await res.json()) as StatsBody;
    const parsed = CorpusSnapshotSchema.safeParse({
      documents: (body.documents ?? []).map((d) => ({ title: d.title, chunkCount: d.chunkCount })),
      totalChunks: body.totalChunks ?? 0,
      corpusMeta: body.corpusMeta ?? null,
    });
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export interface ProvenanceInput {
  targetUrl: string;
  git: { gitCommit: string; gitDirty: boolean };
  bankVersion: string;
  bankHash: string;
  split: Selector;
  runs: number;
  questionCount: number;
  partial: boolean;
  corpus: CorpusSnapshot | null;
  now?: Date;
}

export function buildProvenance(input: ProvenanceInput): Provenance {
  return {
    harnessVersion: HARNESS_VERSION,
    timestamp: (input.now ?? new Date()).toISOString(),
    targetUrl: input.targetUrl,
    gitCommit: input.git.gitCommit,
    gitDirty: input.git.gitDirty,
    bankVersion: input.bankVersion,
    bankHash: input.bankHash,
    split: input.split,
    runs: input.runs,
    questionCount: input.questionCount,
    partial: input.partial,
    corpus: input.corpus,
    rescoredFrom: null,
    originalBankHash: null,
  };
}
