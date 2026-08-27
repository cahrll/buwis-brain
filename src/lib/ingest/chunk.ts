import { Tiktoken } from "js-tiktoken/lite";
import cl100k_base from "js-tiktoken/ranks/cl100k_base";

const TARGET_TOKENS = 500;
const OVERLAP_TOKENS = 60;
const MIN_CHUNK_TOKENS = 8;

export interface PdfPageInput {
  pageNumber: number;
  text: string;
}

export interface MarkdownSectionInput {
  headingTrail: string | null;
  text: string;
}

export interface Chunk {
  ord: number;
  content: string;
  tokenCount: number;
  pageStart: number | null;
  pageEnd: number | null;
  heading: string | null;
}

const encoder = new Tiktoken(cl100k_base);

export function countTokens(text: string): number {
  return encoder.encode(text).length;
}

interface Unit {
  text: string;
  page: number | null;
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 0);
}

/** Token-window fallback for a single paragraph larger than TARGET_TOKENS. */
function splitByTokenWindow(text: string): string[] {
  const tokens = encoder.encode(text);
  if (tokens.length <= TARGET_TOKENS) return [text];
  const parts: string[] = [];
  let start = 0;
  for (;;) {
    const end = Math.min(start + TARGET_TOKENS, tokens.length);
    parts.push(encoder.decode(tokens.slice(start, end)));
    if (end === tokens.length) break;
    start = end - OVERLAP_TOKENS;
  }
  return parts;
}

function chunkUnits(units: Unit[], heading: string | null, startOrd: number): Chunk[] {
  const atoms: Unit[] = units.flatMap((u) =>
    splitByTokenWindow(u.text).map((text) => ({ text, page: u.page })),
  );
  const chunks: Chunk[] = [];
  let current: Unit[] = [];
  let currentTokens = 0;

  const emit = () => {
    if (current.length === 0) return;
    const content = current.map((u) => u.text).join("\n\n");
    const tokenCount = countTokens(content);
    if (tokenCount < MIN_CHUNK_TOKENS) return;
    const pages = current.map((u) => u.page).filter((p): p is number => p !== null);
    chunks.push({
      ord: startOrd + chunks.length,
      content,
      tokenCount,
      pageStart: pages.length ? Math.min(...pages) : null,
      pageEnd: pages.length ? Math.max(...pages) : null,
      heading,
    });
  };

  for (const atom of atoms) {
    const atomTokens = countTokens(atom.text);
    if (current.length > 0 && currentTokens + atomTokens > TARGET_TOKENS) {
      emit();
      // overlap: carry trailing whole atoms totaling <= OVERLAP_TOKENS
      const carry: Unit[] = [];
      let carryTokens = 0;
      for (let i = current.length - 1; i >= 0; i--) {
        const t = countTokens(current[i].text);
        if (carryTokens + t > OVERLAP_TOKENS) break;
        carry.unshift(current[i]);
        carryTokens += t;
      }
      current = carry;
      currentTokens = carryTokens;
    }
    current.push(atom);
    currentTokens += atomTokens;
  }
  emit();
  return chunks;
}

export function chunkPdfPages(pages: PdfPageInput[]): Chunk[] {
  const units: Unit[] = pages.flatMap((p) =>
    splitParagraphs(p.text).map((text) => ({ text, page: p.pageNumber })),
  );
  return chunkUnits(units, null, 0);
}

export function chunkMarkdownSections(sections: MarkdownSectionInput[]): Chunk[] {
  const chunks: Chunk[] = [];
  for (const section of sections) {
    const units: Unit[] = splitParagraphs(section.text).map((text) => ({ text, page: null }));
    chunks.push(...chunkUnits(units, section.headingTrail, chunks.length));
  }
  return chunks;
}
