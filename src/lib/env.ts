const EFFORTS = ["low", "medium", "high"] as const;
export type Effort = (typeof EFFORTS)[number];

export function answerModel(): string {
  return process.env.ANSWER_MODEL ?? "claude-opus-5";
}

export function answerEffort(): Effort {
  const e = process.env.ANSWER_EFFORT ?? "low";
  if (!(EFFORTS as readonly string[]).includes(e)) {
    throw new Error(`Invalid ANSWER_EFFORT "${e}"; expected one of ${EFFORTS.join(", ")}`);
  }
  return e as Effort;
}

export function simFloor(): number {
  const raw = process.env.RETRIEVAL_SIM_FLOOR;
  if (raw === undefined || raw === "") return 0.3;
  const v = Number(raw);
  if (!Number.isFinite(v)) throw new Error(`Invalid RETRIEVAL_SIM_FLOOR "${raw}"`);
  return v;
}

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}
