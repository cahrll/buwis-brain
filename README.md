# buwis-brain

RAG assistant over Philippine government documents: BIR tax rules for
self-employed professionals, plus SSS, PhilHealth and Pag-IBIG voluntary
contribution rules. I built it to answer freelancers' compliance
questions with citations that point to the exact source passage. When
the corpus doesn't cover a question it refuses instead of guessing.

Stack: TypeScript, Next.js (App Router), Postgres with pgvector on Neon,
Anthropic API for answers, OpenAI `text-embedding-3-small` for
embeddings, deployed on Vercel. Retrieval is hybrid, cosine similarity
and full-text search fused with reciprocal rank fusion.

## How it works

Ingestion (`POST /api/ingest`, admin token) parses a PDF or Markdown
file per page or per heading, chunks it to around 500 tokens with a
60-token overlap, embeds the chunks and stores everything in one
transaction. A `corpus_meta` row pins the embedding provider, so
ingesting with a different provider gets a 409 instead of silently
mixing vector spaces.

Asking (`POST /api/ask`) embeds the question, runs pgvector cosine and
tsvector full-text search in parallel (top 20 each), then fuses them
with reciprocal rank fusion (k=60) to pick the top 8 chunks. A
deterministic confidence gate refuses before any LLM call when the best
similarity is below `RETRIEVAL_SIM_FLOOR`. Otherwise the answer model
returns structured output, citations are reconciled on the server, and
an answer with zero citations is downgraded to a refusal. An answer
always carries at least one real citation.

`GET /api/stats` lists the documents, chunk counts and the pinned
embedding provider.

Pass `"debug": true` to `/api/ask` to get read-only retrieval
diagnostics (per-chunk leg ranks, similarity, RRF score, gate values),
on refusals as well. This is the hook for the eval harness milestone.

## Local development

Requirements: Node 22+, Docker for the test DB, a Neon database.

```bash
cp .env.example .env.local          # fill in real values
npm install
npm run migrate                     # applies migrations/ to DATABASE_URL
npm run dev
```

For tests, start a local pgvector container:

```bash
docker run -d --name buwis-pg -e POSTGRES_PASSWORD=postgres -p 5433:5432 pgvector/pgvector:pg17
```

Set `DATABASE_URL_TEST=postgresql://postgres:postgres@localhost:5433/postgres`, then `npm run test`.
Integration suites skip automatically when `DATABASE_URL_TEST` is unset.

## Environment variables

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Neon pooled connection string |
| `DATABASE_URL_TEST` | Local/CI test database |
| `OPENAI_API_KEY` | Embeddings |
| `ANTHROPIC_API_KEY` | Answer synthesis |
| `ANSWER_MODEL` | default `claude-opus-5` |
| `ANSWER_EFFORT` | `low` \| `medium` \| `high`, default `low` |
| `INGEST_TOKEN` | Admin token for `/api/ingest` |
| `RETRIEVAL_SIM_FLOOR` | Confidence gate floor, default `0.3` |

## Deploy runbook (Vercel + Neon)

1. Create a Neon project and copy the pooled connection string.
2. Run `npm run migrate` with `DATABASE_URL` pointed at Neon, set in your
   shell or in `.env.local` (the migrate script reads that file as well).
3. Import the GitHub repo into Vercel, set all env vars above except
   `DATABASE_URL_TEST`, then deploy.
4. Visit `/upload`, enter `INGEST_TOKEN`, ingest the corpus PDFs.
5. Run `BASE_URL=https://<deployment> npm run latency` and check that
   p95 is under 10 s.
6. Ask "who won the 2022 PH election?" and confirm an explicit refusal
   with zero citations.

## Risks and mitigations

`POST /api/ask` is public and every non-gated question spends
answer-model tokens. The mitigations are operational, not code: the
pre-LLM confidence gate blocks off-corpus spam at zero LLM cost, a
spend cap stays set on the Anthropic console, and if the Vercel plan
offers a firewall or rate-limit rule it gets enabled as config.
Rate-limiting code is deliberately out of scope this milestone.

Embedding-space consistency is guarded by `corpus_meta` (409 on
provider mismatch). Switching providers requires a re-ingest.

Synchronous ingest fits a 300 s function for 50-page documents. Larger
corpora would need job-based ingestion, which was deferred on purpose.

One more deploy note: Vercel rejects request bodies over about 4.5 MB
before the ingest route even runs, so the practical upload cap there is
4.5 MB, not the 20 MB the code allows. Use text-based PDFs and split
anything bigger. Scanned image-only PDFs fail anyway since there is no
text to extract.

## Acceptance criteria and how to verify them

| Criterion | How verified |
|---|---|
| Vercel deployment live | URL loads |
| 50+ page BIR PDF ingests; chunk count queryable | `/upload`, then `GET /api/stats` |
| On-corpus answer with a citation resolving to a real chunk | ask on `/`; enforced by the reconciliation downgrade |
| p95 < 10 s over 10 queries | `npm run latency` against the deployment |
| Off-corpus refusal, zero citations | "who won the 2022 PH election?" |
| Tests pass in CI | GitHub Actions `ci` workflow |

## Deliberate limitations

Single-shot Q&A only, no multi-turn. No reranker and no eval harness
yet, the diagnostics hooks are already in place for it. The UI stays
unstyled until the design pass. Embeddings are fixed at 1536
dimensions, migrations are manual and there is no rate limiting. The
refusal floor is hand-tuned until the eval sweep, and the final answer
model gets revisited with the eval harness as well.

The goal of this milestone is a small core that works and can be
measured. The eval harness comes next.
