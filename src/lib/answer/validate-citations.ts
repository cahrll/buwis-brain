import type { ModelAnswer } from "./schema";

export interface ReconciledAnswer {
  refused: boolean;
  reason: string | null;
  answer: string | null;
  citations: number[];
}

const MARKER_RE = /\[(\d{1,3})\]/g;

// spec 9 order matters: union valid inline [n] into citations, strip out-of-range markers,
// dedupe, force refusals to zero citations, only then downgrade uncited answers to refusals
export function reconcileCitations(model: ModelAnswer, contextSize: number): ReconciledAnswer {
  if (model.refused) {
    return {
      refused: true,
      reason: model.reason ?? "not_answerable",
      answer: null,
      citations: [],
    };
  }
  const inRange = (n: number) => Number.isInteger(n) && n >= 1 && n <= contextSize;
  let answer = model.answer ?? "";
  const valid = new Set(model.citations.filter(inRange));
  for (const m of answer.matchAll(MARKER_RE)) {
    const n = Number(m[1]);
    if (inRange(n)) valid.add(n);
  }
  answer = answer.replace(MARKER_RE, (match, d) => (inRange(Number(d)) ? match : ""));
  const citations = [...valid].sort((a, b) => a - b);
  if (answer.trim().length === 0 || citations.length === 0) {
    return { refused: true, reason: "unsupported_answer", answer: null, citations: [] };
  }
  return { refused: false, reason: null, answer, citations };
}
