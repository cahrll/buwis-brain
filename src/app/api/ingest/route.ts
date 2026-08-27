import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { EmbeddingError, OpenAiEmbeddingProvider } from "@/lib/embeddings/openai";
import {
  EmptyDocumentError,
  ingestDocument,
  UnsupportedFileTypeError,
} from "@/lib/ingest/ingest-service";
import { PdfParseError } from "@/lib/ingest/parse-pdf";
import { ProviderMismatchError } from "@/lib/ingest/store";
import { requireEnv } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_FILE_BYTES = 20 * 1024 * 1024;

function tokenMatches(supplied: string | null): boolean {
  const expected = process.env.INGEST_TOKEN;
  if (!expected || !supplied) return false; // fail closed when unconfigured
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!tokenMatches(request.headers.get("x-ingest-token"))) {
    return NextResponse.json({ error: "invalid or missing x-ingest-token" }, { status: 401 });
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "expected multipart/form-data" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file field is required" }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "file exceeds the 20 MB limit" }, { status: 413 });
  }
  const titleField = form.get("title");
  const data = new Uint8Array(await file.arrayBuffer());
  try {
    const provider = new OpenAiEmbeddingProvider(requireEnv("OPENAI_API_KEY"));
    const result = await ingestDocument(getPool(), provider, {
      filename: file.name,
      mimeType: file.type,
      data,
      title: typeof titleField === "string" && titleField.trim() ? titleField : undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof UnsupportedFileTypeError) {
      return NextResponse.json({ error: err.message }, { status: 415 });
    }
    if (err instanceof PdfParseError || err instanceof EmptyDocumentError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    if (err instanceof ProviderMismatchError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (err instanceof EmbeddingError) {
      return NextResponse.json({ error: "embedding provider failed" }, { status: 502 });
    }
    console.error("ingest failed:", err);
    return NextResponse.json({ error: "ingest failed" }, { status: 500 });
  }
}
