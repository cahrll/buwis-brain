CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  filename text NOT NULL,
  mime_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  ord int NOT NULL,
  content text NOT NULL,
  token_count int NOT NULL,
  page_start int,
  page_end int,
  heading text,
  embedding vector(1536) NOT NULL,
  tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
  UNIQUE (document_id, ord)
);

CREATE INDEX chunks_embedding_idx ON chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX chunks_tsv_idx ON chunks USING gin (tsv);
CREATE INDEX chunks_document_id_idx ON chunks (document_id);

CREATE TABLE corpus_meta (
  id int PRIMARY KEY CHECK (id = 1),
  provider_id text NOT NULL,
  dimensions int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
