import type { Pool } from "pg";

export interface StatsDocument {
  id: string;
  title: string;
  chunkCount: number;
  pageCount: number | null;
  createdAt: Date;
}

export interface StatsResult {
  documents: StatsDocument[];
  totalChunks: number;
  corpusMeta: { providerId: string; dimensions: number } | null;
}

export async function getStats(pool: Pool): Promise<StatsResult> {
  const [documents, totals, meta] = await Promise.all([
    pool.query(
      `SELECT d.id, d.title, d.created_at,
              COUNT(c.id)::int AS chunk_count,
              MAX(c.page_end)::int AS page_count
       FROM documents d
       LEFT JOIN chunks c ON c.document_id = d.id
       GROUP BY d.id
       ORDER BY d.created_at DESC`,
    ),
    pool.query("SELECT COUNT(*)::int AS total FROM chunks"),
    pool.query("SELECT provider_id, dimensions FROM corpus_meta WHERE id = 1"),
  ]);
  return {
    documents: documents.rows.map((r) => ({
      id: r.id,
      title: r.title,
      chunkCount: r.chunk_count,
      pageCount: r.page_count,
      createdAt: r.created_at,
    })),
    totalChunks: totals.rows[0].total,
    corpusMeta: meta.rows[0]
      ? { providerId: meta.rows[0].provider_id, dimensions: meta.rows[0].dimensions }
      : null,
  };
}
