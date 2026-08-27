export interface RetrievedChunk {
  id: string;
  documentId: string;
  documentTitle: string;
  content: string;
  pageStart: number | null;
  pageEnd: number | null;
  heading: string | null;
}

export interface VectorHit extends RetrievedChunk {
  similarity: number;
}
