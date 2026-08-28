import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  DocumentRegistrySchema, QuestionBankSchema,
  type DocumentRegistry, type QuestionBank, type QuestionEntry,
} from "./types";

export interface LoadedBank {
  documents: DocumentRegistry;
  bank: QuestionBank;
  hash: string;
  titleToKey: Map<string, string>;
}

export function crossCheck(documents: DocumentRegistry, bank: QuestionBank): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const e of bank.entries) {
    if (seen.has(e.id)) problems.push(`duplicate id ${e.id}`);
    seen.add(e.id);
    for (const d of e.expectedDocs) {
      if (!(d in documents)) problems.push(`${e.id}: unknown docKey ${d}`);
    }
  }
  return problems;
}

export function hashBank(documentsJson: string, questionsJson: string): string {
  const digest = createHash("sha256").update(documentsJson).update("\n").update(questionsJson).digest("hex");
  return `sha256:${digest}`;
}

export function titleIndex(documents: DocumentRegistry): Map<string, string> {
  return new Map(Object.entries(documents).map(([key, d]) => [d.title, key]));
}

export function parseBank(documentsJson: string, questionsJson: string): LoadedBank {
  const documents = DocumentRegistrySchema.parse(JSON.parse(documentsJson));
  const bank = QuestionBankSchema.parse(JSON.parse(questionsJson));
  const problems = crossCheck(documents, bank);
  if (problems.length > 0) throw new Error(`question bank invalid:\n${problems.join("\n")}`);
  return { documents, bank, hash: hashBank(documentsJson, questionsJson), titleToKey: titleIndex(documents) };
}

export function loadBank(dir: string): LoadedBank {
  return parseBank(
    readFileSync(path.join(dir, "documents.json"), "utf8"),
    readFileSync(path.join(dir, "questions.json"), "utf8"),
  );
}

export function selectEntries(
  bank: QuestionBank,
  sel: { split: "dev" | "test" | "all"; questions?: string[] },
): QuestionEntry[] {
  if (sel.questions && sel.questions.length > 0) {
    const want = new Set(sel.questions);
    const found = bank.entries.filter((e) => want.has(e.id));
    const missing = [...want].filter((id) => !found.some((e) => e.id === id));
    if (missing.length > 0) throw new Error(`unknown question ids: ${missing.join(", ")}`);
    return found;
  }
  return sel.split === "all" ? bank.entries : bank.entries.filter((e) => e.split === sel.split);
}

export function mapTitles(
  titles: string[],
  titleToKey: Map<string, string>,
): { keys: string[]; unknown: string[] } {
  const keys: string[] = [];
  const unknown: string[] = [];
  for (const t of titles) {
    const k = titleToKey.get(t);
    if (k === undefined) {
      if (!unknown.includes(t)) unknown.push(t);
    } else if (!keys.includes(k)) {
      keys.push(k);
    }
  }
  return { keys, unknown };
}
