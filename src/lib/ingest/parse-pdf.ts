import { extractText, getDocumentProxy } from "unpdf";
import type { PdfPageInput } from "./chunk";

export interface ParsedPdf {
  pages: PdfPageInput[];
  pageCount: number;
}

export class PdfParseError extends Error {}

export async function parsePdf(data: Uint8Array): Promise<ParsedPdf> {
  let totalPages: number;
  let text: string[];
  try {
    const pdf = await getDocumentProxy(data);
    ({ totalPages, text } = await extractText(pdf, { mergePages: false }));
  } catch (err) {
    throw new PdfParseError(
      `Failed to parse PDF: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const pages = text.map((t, i) => ({ pageNumber: i + 1, text: t }));
  if (pages.length === 0 || pages.every((p) => p.text.trim().length === 0)) {
    throw new PdfParseError("PDF contains no extractable text");
  }
  return { pages, pageCount: totalPages };
}
