import { AskResponseSchema, type AskResponse } from "./types";

export type AskResult =
  | { ok: true; response: AskResponse; roundTripMs: number }
  | { ok: false; error: string; roundTripMs: number };

export interface AskOptions {
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  now?: () => number;
}

export async function ask(baseUrl: string, question: string, opts: AskOptions = {}): Promise<AskResult> {
  const fetchFn = opts.fetchFn ?? fetch;
  const now = opts.now ?? Date.now;
  const started = now();
  const elapsed = () => now() - started;
  try {
    const res = await fetchFn(`${baseUrl}/api/ask`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question, debug: true }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}`, roundTripMs: elapsed() };
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return { ok: false, error: `invalid JSON: ${text.slice(0, 200)}`, roundTripMs: elapsed() };
    }
    const parsed = AskResponseSchema.safeParse(json);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.map(String).join(".")} ${i.message}`).join("; ");
      return { ok: false, error: `schema: ${issues}`, roundTripMs: elapsed() };
    }
    return { ok: true, response: parsed.data, roundTripMs: elapsed() };
  } catch (err) {
    const error = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    return { ok: false, error, roundTripMs: elapsed() };
  }
}
