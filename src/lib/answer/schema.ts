import { z } from "zod";

export const ModelAnswerSchema = z.object({
  refused: z.boolean(),
  reason: z.string().nullable(),
  answer: z.string().nullable(),
  citations: z.array(z.number().int()),
});

export type ModelAnswer = z.infer<typeof ModelAnswerSchema>;
