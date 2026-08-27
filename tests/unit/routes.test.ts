import { afterEach, describe, expect, it } from "vitest";
import { POST as askPost } from "../../src/app/api/ask/route";
import { POST as ingestPost } from "../../src/app/api/ingest/route";

afterEach(() => {
  delete process.env.INGEST_TOKEN;
  delete process.env.OPENAI_API_KEY;
});

function askRequest(body: unknown): Request {
  return new Request("http://test/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/ask validation", () => {
  it("400 on empty question", async () => {
    const res = await askPost(askRequest({ question: "   " }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/question/);
  });

  it("400 on question over 1000 chars", async () => {
    const res = await askPost(askRequest({ question: "x".repeat(1001) }));
    expect(res.status).toBe(400);
  });

  it("400 on non-JSON body", async () => {
    const res = await askPost(new Request("http://test/api/ask", { method: "POST", body: "nope" }));
    expect(res.status).toBe(400);
  });

  it("500 when OPENAI_API_KEY is not configured (not a provider failure)", async () => {
    delete process.env.OPENAI_API_KEY;
    const res = await askPost(askRequest({ question: "test" }));
    expect(res.status).toBe(500);
  });
});

describe("POST /api/ingest auth", () => {
  it("401 when the token header is missing", async () => {
    process.env.INGEST_TOKEN = "secret";
    const res = await ingestPost(new Request("http://test/api/ingest", { method: "POST" }));
    expect(res.status).toBe(401);
  });

  it("401 when the token is wrong", async () => {
    process.env.INGEST_TOKEN = "secret";
    const res = await ingestPost(
      new Request("http://test/api/ingest", {
        method: "POST",
        headers: { "x-ingest-token": "wrong" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("401 when INGEST_TOKEN is not configured (fail closed)", async () => {
    const res = await ingestPost(
      new Request("http://test/api/ingest", {
        method: "POST",
        headers: { "x-ingest-token": "anything" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("400 when authed but no multipart body", async () => {
    process.env.INGEST_TOKEN = "secret";
    const res = await ingestPost(
      new Request("http://test/api/ingest", {
        method: "POST",
        headers: { "x-ingest-token": "secret" },
      }),
    );
    expect(res.status).toBe(400);
  });
});
