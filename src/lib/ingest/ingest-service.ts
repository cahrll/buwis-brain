import type { Pool } from "pg";
import type { EmbeddingProvider } from "../embeddings/provider";
import { chunkMarkdownSections, chunkPdfPages, type Chunk } from "./chunk";
import { parseMarkdown } from "./parse-markdown";
import { parsePdf } from "./parse-pdf";
import { storeDocument } from "./store";

export class UnsupportedFileTypeError extends Error {}
export class EmptyDocumentError extends Error {}

export interface IngestInput {
  filename: string;
  mimeType: string;
  data: Uint8Array;
  title?: string;
}

export interface IngestResult {
  documentId: string;
  title: string;
  chunkCount: number;
  pageCount: number | null;
}

function isPdf(input: IngestInput): boolean {
  return input.mimeType === "application/pdf" || input.filename.toLowerCase().endsWith(".pdf");
}

function isMarkdown(input: IngestInput): boolean {
  const name = input.filename.toLowerCase();
  return (
    input.mimeType === "text/markdown" || name.endsWith(".md") || name.endsWith(".markdown")
  );
}

export async function ingestDocument(
  pool: Pool,
  provider: EmbeddingProvider,
  input: IngestInput,
): Promise<IngestResult> {
  const title = input.title?.trim() || input.filename;
  let chunks: Chunk[];
  let pageCount: number | null;
  if (isPdf(input)) {
    const parsed = await parsePdf(input.data);
    chunks = chunkPdfPages(parsed.pages);
    pageCount = parsed.pageCount;
  } else if (isMarkdown(input)) {
    chunks = chunkMarkdownSections(parseMarkdown(new TextDecoder().decode(input.data)));
    pageCount = null;
  } else {
    throw new UnsupportedFileTypeError(`Unsupported file type: ${input.mimeType} (${input.filename})`);
  }
  if (chunks.length === 0) {
    throw new EmptyDocumentError("Document produced no chunks");
  }
  const embeddings = await provider.embed(chunks.map((c) => c.content));
  const { documentId } = await storeDocument(pool, provider, {
    title,
    filename: input.filename,
    mimeType: input.mimeType,
    chunks,
    embeddings,
  });
  return { documentId, title, chunkCount: chunks.length, pageCount };
}
