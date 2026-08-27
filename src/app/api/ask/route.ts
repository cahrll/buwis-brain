import { NextResponse } from "next/server";
import { z } from "zod";
import { SynthesisError, synthesize } from "@/lib/answer/synthesize";
import { askQuestion } from "@/lib/ask-service";
import { getPool } from "@/lib/db";
import { EmbeddingError, OpenAiEmbeddingProvider } from "@/lib/embeddings/openai";
import { requireEnv } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 60;

const BodySchema = z.object({
  question: z.string().trim().min(1).max(1000),
  debug: z.boolean().optional(),
});

export async function POST(request: Request): Promise<NextResponse> {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "question must be a non-empty string of at most 1000 characters" },
      { status: 400 },
    );
  }
  try {
    const provider = new OpenAiEmbeddingProvider(requireEnv("OPENAI_API_KEY"));
    const result = await askQuestion(
      { pool: getPool(), provider, synthesizeFn: synthesize },
      { question: body.question, debug: body.debug },
    );
    return NextResponse.json(result);
  } catch (err) {
    console.error("ask failed:", err);
    // 502 for upstream provider/model failures; anything else is our bug
    if (err instanceof SynthesisError || err instanceof EmbeddingError) {
      return NextResponse.json({ error: "answering failed" }, { status: 502 });
    }
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
