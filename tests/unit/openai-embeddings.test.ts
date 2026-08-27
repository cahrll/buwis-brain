import { describe, expect, it, vi } from "vitest";
import { EmbeddingError, OpenAiEmbeddingProvider } from "../../src/lib/embeddings/openai";

function okResponse(embeddings: number[][]): Response {
  return new Response(
    JSON.stringify({ data: embeddings.map((embedding, index) => ({ index, embedding })) }),
    { status: 200 },
  );
}

describe("OpenAiEmbeddingProvider", () => {
  it("sends model and input, returns embeddings in order", async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse([[1, 0], [0, 1]]));
    const provider = new OpenAiEmbeddingProvider("key", fetchFn as unknown as typeof fetch);
    const out = await provider.embed(["a", "b"]);
    expect(out).toEqual([[1, 0], [0, 1]]);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/embeddings");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({ model: "text-embedding-3-small", input: ["a", "b"] });
  });

  it("splits into batches of 100", async () => {
    const fetchFn = vi.fn().mockImplementation(async (_url: unknown, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as { input: string[] };
      return okResponse(body.input.map(() => [0]));
    });
    const provider = new OpenAiEmbeddingProvider("key", fetchFn as unknown as typeof fetch);
    const out = await provider.embed(Array.from({ length: 250 }, (_, i) => `t${i}`));
    expect(out).toHaveLength(250);
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(JSON.parse(fetchFn.mock.calls[0][1].body as string).input).toHaveLength(100);
    expect(JSON.parse(fetchFn.mock.calls[1][1].body as string).input).toHaveLength(100);
    expect(JSON.parse(fetchFn.mock.calls[2][1].body as string).input).toHaveLength(50);
  });

  it("sorts response data by index", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ data: [{ index: 1, embedding: [2] }, { index: 0, embedding: [1] }] }),
        { status: 200 },
      ),
    );
    const provider = new OpenAiEmbeddingProvider("key", fetchFn as unknown as typeof fetch);
    expect(await provider.embed(["a", "b"])).toEqual([[1], [2]]);
  });

  it("throws EmbeddingError on non-2xx", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("quota", { status: 429 }));
    const provider = new OpenAiEmbeddingProvider("key", fetchFn as unknown as typeof fetch);
    await expect(provider.embed(["a"])).rejects.toBeInstanceOf(EmbeddingError);
  });
});
