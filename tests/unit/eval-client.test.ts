import { describe, expect, it, vi } from "vitest";
import { ask } from "../../evals/src/client";

const valid = {
  refused: true, reason: "low_confidence", answer: null, citations: [], latencyMs: 900,
  diagnostics: { chunks: [], bestSimilarity: 0.1, simFloor: 0.3, usage: null },
};

function fetchReturning(status: number, body: string) {
  return vi.fn(async () => ({ ok: status < 400, status, text: async () => body })) as unknown as typeof fetch;
}

describe("ask", () => {
  it("posts the question with debug and returns the parsed response", async () => {
    const fetchFn = fetchReturning(200, JSON.stringify(valid));
    let t = 1000;
    const out = await ask("https://x", "Q?", { fetchFn, now: () => (t += 250) });
    expect(out).toEqual({ ok: true, response: valid, roundTripMs: 250 });
    const [url, init] = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://x/api/ask");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ question: "Q?", debug: true });
  });
  it("turns a non-200 into an error result", async () => {
    const out = await ask("https://x", "Q?", { fetchFn: fetchReturning(502, '{"error":"answering failed"}') });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/^HTTP 502/);
  });
  it("turns invalid JSON into an error result", async () => {
    const out = await ask("https://x", "Q?", { fetchFn: fetchReturning(200, "<html>") });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/^invalid JSON/);
  });
  it("turns a schema mismatch into an error result naming the path", async () => {
    const out = await ask("https://x", "Q?", { fetchFn: fetchReturning(200, JSON.stringify({ ...valid, diagnostics: undefined })) });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/^schema: diagnostics/);
  });
  it("turns a timeout into an error result", async () => {
    const fetchFn = vi.fn(async () => {
      throw Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
    }) as unknown as typeof fetch;
    const out = await ask("https://x", "Q?", { fetchFn, timeoutMs: 5 });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/^TimeoutError/);
  });
});
