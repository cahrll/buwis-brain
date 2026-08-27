import type { Pool, PoolClient } from "pg";
import type { EmbeddingProvider } from "../embeddings/provider";
import type { Chunk } from "./chunk";

const INSERT_BATCH = 50;

export class ProviderMismatchError extends Error {
  constructor(stored: string, active: string) {
    super(
      `Corpus was embedded with "${stored}" but the active provider is "${active}". Re-ingest the corpus to switch providers.`,
    );
  }
}

export interface StoreDocumentInput {
  title: string;
  filename: string;
  mimeType: string;
  chunks: Chunk[];
  embeddings: number[][];
}

export async function storeDocument(
  pool: Pool,
  provider: Pick<EmbeddingProvider, "id" | "dimensions">,
  input: StoreDocumentInput,
): Promise<{ documentId: string }> {
  if (input.chunks.length !== input.embeddings.length) {
    throw new Error("chunks/embeddings length mismatch");
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: meta } = await client.query(
      "SELECT provider_id, dimensions FROM corpus_meta WHERE id = 1 FOR UPDATE",
    );
    if (meta.length === 0) {
      await client.query(
        "INSERT INTO corpus_meta (id, provider_id, dimensions) VALUES (1, $1, $2)",
        [provider.id, provider.dimensions],
      );
    } else if (meta[0].provider_id !== provider.id || meta[0].dimensions !== provider.dimensions) {
      throw new ProviderMismatchError(
        `${meta[0].provider_id} (${meta[0].dimensions} dims)`,
        `${provider.id} (${provider.dimensions} dims)`,
      );
    }
    const { rows: docRows } = await client.query(
      "INSERT INTO documents (title, filename, mime_type) VALUES ($1, $2, $3) RETURNING id",
      [input.title, input.filename, input.mimeType],
    );
    const documentId: string = docRows[0].id;
    for (let i = 0; i < input.chunks.length; i += INSERT_BATCH) {
      await insertChunkBatch(
        client,
        documentId,
        input.chunks.slice(i, i + INSERT_BATCH),
        input.embeddings.slice(i, i + INSERT_BATCH),
      );
    }
    await client.query("COMMIT");
    return { documentId };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function insertChunkBatch(
  client: PoolClient,
  documentId: string,
  chunks: Chunk[],
  embeddings: number[][],
): Promise<void> {
  const values: string[] = [];
  const params: unknown[] = [];
  chunks.forEach((c, i) => {
    const b = i * 8;
    values.push(
      `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7}, $${b + 8}::vector)`,
    );
    params.push(
      documentId, c.ord, c.content, c.tokenCount,
      c.pageStart, c.pageEnd, c.heading, JSON.stringify(embeddings[i]),
    );
  });
  await client.query(
    `INSERT INTO chunks (document_id, ord, content, token_count, page_start, page_end, heading, embedding)
     VALUES ${values.join(", ")}`,
    params,
  );
}
