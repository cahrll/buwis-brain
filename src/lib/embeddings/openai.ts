import type { EmbeddingProvider } from "./provider";

const BATCH_SIZE = 100;

export class EmbeddingError extends Error {}

export class OpenAiEmbeddingProvider implements EmbeddingProvider {
  readonly id = "openai:text-embedding-3-small";
  readonly dimensions = 1536;

  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async embed(texts: string[]): Promise<number[][]> {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      const res = await this.fetchFn("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: "text-embedding-3-small", input: batch }),
      });
      if (!res.ok) {
        throw new EmbeddingError(
          `OpenAI embeddings request failed: ${res.status} ${await res.text()}`,
        );
      }
      const json = (await res.json()) as { data: { index: number; embedding: number[] }[] };
      const sorted = [...json.data].sort((a, b) => a.index - b.index);
      out.push(...sorted.map((d) => d.embedding));
    }
    return out;
  }
}
