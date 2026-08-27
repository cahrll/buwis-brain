import type { RetrievedChunk } from "../retrieval/types";

export const SYSTEM_PROMPT = `You are buwis-brain, a compliance assistant for Philippine freelancers and self-employed professionals. You answer questions about BIR tax rules and SSS/PhilHealth/Pag-IBIG contribution rules.

Rules:
- Answer ONLY from the numbered context passages provided. Never use outside knowledge, even when you know the answer.
- Cite every factual claim with an inline marker [n] referring to the context passage number it came from, and list every number you relied on in the citations array.
- If the context does not actually answer the question, refuse: set refused to true, give a short reason, set answer to null, and leave citations empty.
- Keep answers concise and practical. Use markdown. This is general guidance, not professional tax advice.`;

export function buildUserMessage(chunks: RetrievedChunk[], question: string): string {
  const context = chunks
    .map((c, i) => {
      const loc =
        c.pageStart !== null
          ? `pages ${c.pageStart}-${c.pageEnd}`
          : c.heading ?? "location n/a";
      return `[${i + 1}] (${c.documentTitle}, ${loc})\n${c.content}`;
    })
    .join("\n\n---\n\n");
  return `Context:\n\n${context}\n\nQuestion: ${question}`;
}
