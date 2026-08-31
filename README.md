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
diagnostics, on refusals as well: per-chunk document title, leg ranks,
similarity and RRF score, the gate values, and `usage` with the answer
model and its input and output tokens (`null` when the gate refused
before any model call). This is the hook the eval harness drives.

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
   p95 is under 12 s.
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
| p95 < 12 s over 10 queries | `npm run latency` against the deployment |
| Off-corpus refusal, zero citations | "who won the 2022 PH election?" |
| Tests pass in CI | GitHub Actions `ci` workflow |

## Eval harness

The harness drives the deployed API end to end over a committed question
bank and writes one self-describing JSON per run. It is an API client
only: nothing under `evals/` imports from `src/`, and the metrics are
computed by a pure scorer that CI tests against fixtures, so a run needs
a live deployment but CI never needs the network.

```bash
EVAL_TARGET_URL=https://<deployment> npm run eval                # test split, 3 runs
EVAL_TARGET_URL=https://<deployment> npm run eval -- --runs 1 --split dev
npm run eval:score -- evals/results/<file>.json                  # re-score without re-running
```

The bank (`evals/bank/`) has 48 questions labeled with a category, the
expected behavior (`answer`, `refuse`, `either`), the documents that
should be retrieved, and a dev/test split. Categories cover on-corpus
questions per agency, questions answerable only deep in the NIRC,
corpus-currency traps, far and near-domain off-corpus questions, and
borderline phrasings.

Every results file carries provenance (timestamp, target URL, git
commit, bank hash, a snapshot of the corpus from `/api/stats`) and the
raw rows for every question and run, so any number in it can be traced
back without re-running. A named baseline is written with
`--baseline <label>`; the CLI refuses that when the tree is dirty or the
run was interrupted, and a test enforces the same on every committed
file.

What the aggregates measure: retrieval hit rate is scored from the
diagnostic top 8, not from citations, so it isolates retrieval from
synthesis. Refusal rates split gate refusals from model refusals, which
is how the floor question gets a number. Stability runs every question
three times, sequentially, and reports how often the behavior agreed.
Cost comes from the token usage the API reports, priced per model.

### Baseline, 2026-08-31, production

| Metric | Value |
|---|---|
| Retrieval hit rate (any expected doc in top 8) | 97% |
| Correct-refusal rate on off-corpus questions | 100% |
| Off-corpus questions that reached the model | 100% |
| False-refusal rate on on-corpus questions | 4% |
| Behavior stability over 3 runs | 97% |
| Server latency p95 | 8.3 s |
| Questions with any keyword-leg chunk in the top 8 | 20% |
| Cost of the run | $3.97 |

Unstable questions in the baseline: philhealth-self-earning-04.
The full file is `evals/baselines/2026-08-31-production.json`.

### Corpus-currency traps

These questions get a faithful answer from the corpus that is stale in
2026. The baseline scores them as behavior only (answered, expected
document hit); whether the answer discloses the staleness is the next
stage's job.

| Question | Superseded by | Since | What changed |
|---|---|---|---|
| Do I have to pay the 500 peso annual registration fee every January? | RA 11976 (Ease of Paying Taxes Act) | 2024-01-22 | annual registration fee under Section 236(B) abolished |
| Do I need to issue official receipts for my professional fees? | RA 11976 (Ease of Paying Taxes Act) | 2024-01-22 | invoices replace official receipts as the primary document for sales of services under Section 237 |
| What is the maximum monthly Pag-IBIG contribution for an employee? | HDMF Circular No. 460 | 2024-02-01 | monthly fund salary cap raised from 5,000 to 10,000 pesos, doubling the maximum member share from 100 to 200 pesos |
| What was the PhilHealth premium rate for 2023? | Malacañang memorandum (ES Bersamin, 2023-01-02), affirmed by PhilHealth board 2023-01-04 | 2023-01-01 | 2023 premium rate held at 4% instead of the scheduled 4.5% |
| What was the percentage tax rate for a non-VAT freelancer in 2022? | RA 11534 (CREATE Act) | 2020-07-01 | Section 116 percentage tax temporarily reduced from 3% to 1% until 2023-06-30; corpus states the 3% that applied before and after |

## Deliberate limitations

Single-shot Q&A only, no multi-turn. No reranker. The eval harness
measures the system but does not yet judge answer faithfulness or
trace requests; those are the next stage. The UI stays unstyled until
the design pass. Embeddings are fixed at 1536 dimensions, migrations
are manual and there is no rate limiting. The refusal floor is
hand-tuned until the eval sweep, and the final answer model gets
revisited with the eval harness as well.

The core is small, works, and now has a measured baseline. Retrieval
changes come next, each one compared against that baseline.
