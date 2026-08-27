import type { Pool } from "pg";
import type { VectorHit } from "./types";

export async function vectorSearch(
  pool: Pool,
  embedding: number[],
  limit = 20,
): Promise<VectorHit[]> {
  const { rows } = await pool.query(
    `SELECT c.id, c.document_id, d.title AS document_title, c.content,
            c.page_start, c.page_end, c.heading,
            1 - (c.embedding <=> $1::vector) AS similarity
     FROM chunks c
     JOIN documents d ON d.id = c.document_id
     ORDER BY c.embedding <=> $1::vector
     LIMIT $2`,
    [JSON.stringify(embedding), limit],
  );
  return rows.map((r) => ({
    id: r.id,
    documentId: r.document_id,
    documentTitle: r.document_title,
    content: r.content,
    pageStart: r.page_start,
    pageEnd: r.page_end,
    heading: r.heading,
    similarity: Number(r.similarity),
  }));
}
