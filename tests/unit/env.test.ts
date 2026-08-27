import { afterEach, describe, expect, it } from "vitest";
import { answerEffort, answerModel, requireEnv, simFloor } from "../../src/lib/env";

const CLEAN = ["ANSWER_MODEL", "ANSWER_EFFORT", "RETRIEVAL_SIM_FLOOR", "TEST_REQUIRED_VAR"];

afterEach(() => {
  for (const k of CLEAN) delete process.env[k];
});

describe("env", () => {
  it("defaults", () => {
    expect(answerModel()).toBe("claude-opus-5");
    expect(answerEffort()).toBe("low");
    expect(simFloor()).toBe(0.3);
  });

  it("reads overrides", () => {
    process.env.ANSWER_MODEL = "claude-sonnet-5";
    process.env.ANSWER_EFFORT = "medium";
    process.env.RETRIEVAL_SIM_FLOOR = "0.42";
    expect(answerModel()).toBe("claude-sonnet-5");
    expect(answerEffort()).toBe("medium");
    expect(simFloor()).toBeCloseTo(0.42, 10);
  });

  it("rejects invalid values", () => {
    process.env.ANSWER_EFFORT = "turbo";
    expect(() => answerEffort()).toThrow(/ANSWER_EFFORT/);
    process.env.RETRIEVAL_SIM_FLOOR = "abc";
    expect(() => simFloor()).toThrow(/RETRIEVAL_SIM_FLOOR/);
  });

  it("requireEnv throws when unset", () => {
    expect(() => requireEnv("TEST_REQUIRED_VAR")).toThrow(/TEST_REQUIRED_VAR/);
    process.env.TEST_REQUIRED_VAR = "x";
    expect(requireEnv("TEST_REQUIRED_VAR")).toBe("x");
  });
});
