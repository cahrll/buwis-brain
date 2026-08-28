import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { answerEffort, answerModel } from "../env";
import type { RetrievedChunk } from "../retrieval/types";
import { buildUserMessage, SYSTEM_PROMPT } from "./prompt";
import { ModelAnswerSchema, type ModelAnswer, type UsageInfo } from "./schema";

export class SynthesisError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

export type SynthesizeFn = (
  chunks: RetrievedChunk[],
  question: string,
) => Promise<ModelAnswer>;

let defaultClient: Anthropic | undefined;

function getClient(): Anthropic {
  defaultClient ??= new Anthropic();
  return defaultClient;
}

export async function synthesize(
  chunks: RetrievedChunk[],
  question: string,
  client: Anthropic = getClient(),
): Promise<ModelAnswer> {
  let response;
  try {
    response = await client.beta.messages.create({
      model: answerModel(),
      max_tokens: 2048,
      output_config: { effort: answerEffort(), format: zodOutputFormat(ModelAnswerSchema) },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserMessage(chunks, question) }],
    });
  } catch (err) {
    throw new SynthesisError(
      `anthropic request failed: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
  const usage: UsageInfo | undefined = response.usage
    ? { model: response.model, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens }
    : undefined;
  if (response.stop_reason === "refusal") {
    return { refused: true, reason: "model_declined", answer: null, citations: [], ...(usage ? { usage } : {}) };
  }
  const text = response.content.find(
    (b): b is Anthropic.Beta.BetaTextBlock => b.type === "text",
  )?.text;
  if (!text) throw new SynthesisError("Model returned no text content");
  try {
    return { ...ModelAnswerSchema.parse(JSON.parse(text)), ...(usage ? { usage } : {}) };
  } catch (err) {
    throw new SynthesisError(
      `Model output did not match schema: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
