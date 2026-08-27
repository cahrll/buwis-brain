import type { Pool } from "pg";
import type { RetrievedChunk } from "./types";

export async function keywordSearch(
  pool: Pool,
  question: string,
  limit = 20,
): Promise<RetrievedChunk[]> {
  const { rows } = await pool.query(
    `SELECT c.id, c.document_id, d.title AS document_title, c.content,
            c.page_start, c.page_end, c.heading
     FROM chunks c
     JOIN documents d ON d.id = c.document_id
     WHERE c.tsv @@ websearch_to_tsquery('english', $1)
     ORDER BY ts_rank_cd(c.tsv, websearch_to_tsquery('english', $1)) DESC, c.id
     LIMIT $2`,
    [question, limit],
  );
  return rows.map((r) => ({
    id: r.id,
    documentId: r.document_id,
    documentTitle: r.document_title,
    content: r.content,
    pageStart: r.page_start,
    pageEnd: r.page_end,
    heading: r.heading,
  }));
}
