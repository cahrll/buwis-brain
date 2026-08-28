import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { loadBank, selectEntries, type LoadedBank } from "./bank";
import { collect } from "./collect";
import { buildProvenance, fetchCorpusSnapshot, gitInfo } from "./provenance";
import { scoreRows } from "./score";
import { ResultsFileSchema, type ResultsFile, type Row, type Selector } from "./types";

const USAGE =
  "usage: cli.ts run [--split test|dev|all] [--runs N] [--questions a,b] [--baseline label] [--force] [--out dir] | cli.ts score <file>";

export interface CliOptions {
  command: "run" | "score";
  split: "dev" | "test" | "all";
  runs: number;
  questions: string[];
  baseline: string | null;
  force: boolean;
  out: string;
  file: string | null;
}

export function parseCliOptions(argv: string[]): CliOptions {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      split: { type: "string", default: "test" },
      runs: { type: "string", default: "3" },
      questions: { type: "string" },
      baseline: { type: "string" },
      force: { type: "boolean", default: false },
      out: { type: "string", default: "evals/results" },
    },
  });
  const command = positionals[0];
  if (command !== "run" && command !== "score") throw new Error(USAGE);
  const split = values.split ?? "test";
  if (split !== "dev" && split !== "test" && split !== "all") throw new Error(`--split must be dev, test or all, got ${split}`);
  const runs = Number(values.runs);
  if (!Number.isInteger(runs) || runs < 1) throw new Error(`--runs must be a positive integer, got ${values.runs}`);
  const baseline = values.baseline ?? null;
  if (baseline !== null && !/^[a-z0-9-]+$/.test(baseline)) throw new Error("--baseline label must be a lowercase slug");
  const file = positionals[1] ?? null;
  if (command === "score" && file === null) throw new Error("score needs a results file path");
  return {
    command,
    split,
    runs,
    questions: (values.questions ?? "").split(",").map((s) => s.trim()).filter((s) => s.length > 0),
    baseline,
    force: values.force ?? false,
    out: values.out ?? "evals/results",
    file,
  };
}

export type WriteDecision = { ok: true; warning: string | null } | { ok: false; reason: string };

export function decideWrite(input: { baseline: string | null; gitDirty: boolean; force: boolean; partial: boolean }): WriteDecision {
  if (input.baseline === null) {
    return { ok: true, warning: input.gitDirty ? "working tree is dirty; recorded in provenance" : null };
  }
  if (input.partial) return { ok: false, reason: "refusing to write a partial run to baselines/" };
  if (input.gitDirty && !input.force) {
    return { ok: false, reason: "refusing to write a baseline from a dirty working tree; commit first or pass --force" };
  }
  return { ok: true, warning: input.gitDirty ? "baseline written from a dirty tree with --force; gitDirty recorded" : null };
}

export function resultsFileName(now: Date, baseline: string | null): string {
  const iso = now.toISOString();
  return baseline === null ? `${iso.slice(0, 19).replace(/:/g, "-")}Z.json` : `${iso.slice(0, 10)}-${baseline}.json`;
}

const fmt = (v: number | null, digits = 3) => (v === null ? "n/a" : v.toFixed(digits));
const ms = (v: number | null) => (v === null ? "n/a" : `${Math.round(v)} ms`);

export function formatSummary(file: ResultsFile, filePath: string): string {
  const a = file.aggregates;
  const f = file.flags;
  const p = file.provenance;
  return [
    `results: ${filePath}`,
    `rows ${a.counts.rows} (errors ${a.counts.errors}, llm calls ${a.counts.llmCalls}) | split ${p.split} | runs ${p.runs} | partial ${p.partial}`,
    `retrieval anyHit ${fmt(a.retrieval.anyHitRate)} allExpected ${fmt(a.retrieval.allExpectedDocsRate)} citedHit ${fmt(a.retrieval.citedHitRate)}`,
    `refusal correct ${fmt(a.refusal.correctRefusalRate)} (gate ${fmt(a.refusal.correctRefusalAtGateRate)}) offCorpusReachedLlm ${fmt(a.refusal.offCorpusReachedLlmRate)} | false ${fmt(a.refusal.falseRefusalRate)} (gate ${fmt(a.refusal.falseRefusalAtGateRate)}, model ${fmt(a.refusal.falseRefusalByModelRate)})`,
    `stability behavior ${fmt(a.stability.behaviorStabilityRate)} docSet ${fmt(a.stability.docSetStabilityRate)}`,
    `latency server p50 ${ms(a.latency.server.p50)} p95 ${ms(a.latency.server.p95)} | roundTrip p50 ${ms(a.latency.roundTrip.p50)} p95 ${ms(a.latency.roundTrip.p95)}`,
    `cost total $${fmt(a.cost.totalUsd, 2)} | per question $${fmt(a.cost.meanUsdPerQuestion, 4)} | per llm call $${fmt(a.cost.meanUsdPerLlmCall, 4)} | models ${a.cost.models.join(", ") || "none"}`,
    `keyword leg chunkShare ${fmt(a.keywordLeg.chunkShare)} questionShare ${fmt(a.keywordLeg.questionShare)}`,
    `flags unstable ${f.unstableQuestions.length}, falseRefusals ${f.falseRefusals.length}, missedRefusals ${f.missedRefusals.length}, retrievalMisses ${f.retrievalMisses.length}, trapAnswers ${f.currencyTrapAnswers.length}, unknownTitles ${f.unknownTitles.length}`,
  ].join("\n");
}

function writeResults(target: string, file: ResultsFile): void {
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(file, null, 2)}\n`);
}

async function runCommand(opts: CliOptions, bank: LoadedBank): Promise<number> {
  const targetUrl = process.env.EVAL_TARGET_URL;
  if (!targetUrl) {
    console.error("EVAL_TARGET_URL is not set");
    return 1;
  }
  const entries = selectEntries(bank.bank, { split: opts.split, questions: opts.questions });
  const git = gitInfo();
  const pre = decideWrite({ baseline: opts.baseline, gitDirty: git.gitDirty, force: opts.force, partial: false });
  if (!pre.ok) {
    console.error(pre.reason);
    return 1;
  }
  if (pre.warning) console.warn(`warning: ${pre.warning}`);
  const corpus = await fetchCorpusSnapshot(targetUrl);
  const timeoutMs = Number(process.env.EVAL_TIMEOUT_MS ?? 60_000);
  let stop = false;
  const onSigint = () => {
    stop = true;
    console.log("interrupted; finishing the current request");
  };
  process.once("SIGINT", onSigint);
  const rows: Row[] = [];
  let partial = false;
  try {
    partial = (
      await collect({
        baseUrl: targetUrl, entries, runs: opts.runs, titleToKey: bank.titleToKey, askOptions: { timeoutMs },
        onRow: (r) => rows.push(r), onProgress: (l) => console.log(l), shouldStop: () => stop,
      })
    ).partial;
  } catch (err) {
    console.error(`collection stopped: ${err instanceof Error ? err.message : String(err)}`);
    partial = true;
  } finally {
    process.off("SIGINT", onSigint);
  }
  const now = new Date();
  const split: Selector = opts.questions.length > 0 ? "questions" : opts.split;
  const provenance = buildProvenance({
    targetUrl, git, bankVersion: bank.bank.version, bankHash: bank.hash, split, runs: opts.runs,
    questionCount: entries.length, partial, corpus, now,
  });
  const { aggregates, flags } = scoreRows(rows, bank, opts.runs);
  const file: ResultsFile = { provenance, aggregates, flags, rows };
  const post = decideWrite({ baseline: opts.baseline, gitDirty: git.gitDirty, force: opts.force, partial });
  if (!post.ok) console.warn(`warning: ${post.reason}; writing to ${opts.out} instead`);
  const toBaseline = post.ok && opts.baseline !== null;
  const dir = toBaseline ? path.join("evals", "baselines") : opts.out;
  const target = path.join(dir, resultsFileName(now, toBaseline ? opts.baseline : null));
  writeResults(target, file);
  console.log(formatSummary(file, target));
  return 0;
}

function scoreCommand(opts: CliOptions, bank: LoadedBank): number {
  const parsed = ResultsFileSchema.safeParse(JSON.parse(readFileSync(opts.file!, "utf8")));
  if (!parsed.success) {
    console.error(`not a results file: ${parsed.error.issues[0]?.message ?? "schema mismatch"}`);
    return 1;
  }
  const original = parsed.data;
  if (original.provenance.bankHash !== bank.hash) {
    console.warn(`warning: bank changed since this run (${original.provenance.bankHash} -> ${bank.hash})`);
  }
  const { aggregates, flags, skippedQuestionIds } = scoreRows(original.rows, bank, original.provenance.runs);
  if (skippedQuestionIds.length > 0) {
    console.warn(`warning: skipped rows for questions no longer in the bank: ${skippedQuestionIds.join(", ")}`);
  }
  const file: ResultsFile = {
    provenance: {
      ...original.provenance,
      timestamp: new Date().toISOString(),
      rescoredFrom: opts.file!,
      originalBankHash: original.provenance.originalBankHash ?? original.provenance.bankHash,
      bankHash: bank.hash,
    },
    aggregates, flags, rows: original.rows,
  };
  const target = `${opts.file!.replace(/\.json$/, "")}.rescored.json`;
  writeResults(target, file);
  console.log(formatSummary(file, target));
  return 0;
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const opts = parseCliOptions(argv);
  const bank = loadBank(path.join("evals", "bank"));
  return opts.command === "run" ? runCommand(opts, bank) : scoreCommand(opts, bank);
}

// tsx sets argv[1] to the script path; vitest does not, so importing this module runs nothing
const invokedDirectly = path.basename(process.argv[1] ?? "") === "cli.ts";
if (invokedDirectly) {
  main()
    .then((code) => process.exit(code))
    .catch((err: unknown) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}
