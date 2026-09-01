# buwis-brain

A RAG assistant that answers Philippine tax and contribution questions for freelancers, with every answer cited to the exact source passage or refused outright.

![Demo: asking about the 8% income tax option](public/demo.gif)

Live at [buwis-brain.vercel.app](https://buwis-brain.vercel.app).

## Architecture

```mermaid
flowchart LR
  U["PDF or Markdown"] --> C["Chunk: ~500 tokens, 60 overlap"]
  C --> E["Embed: text-embedding-3-small"]
  E --> DB[("Postgres: pgvector + tsvector")]
  Q["Question"] --> VS["Cosine search, top 20"]
  Q --> KS["Full-text search, top 20"]
  DB --> VS
  DB --> KS
  VS --> RRF["RRF fusion, k=60, top 8"]
  KS --> RRF
  RRF --> G{"Confidence gate"}
  G -->|"below floor"| REF["Refusal, zero citations"]
  G -->|"clears floor"| SYN["Answer synthesis"]
  SYN --> CV["Citation validation"]
  CV -->|"no valid citations"| REF
  CV --> ANS["Cited answer"]
```

TypeScript, Next.js App Router, Postgres with pgvector on Neon, Anthropic API for answers, OpenAI embeddings, deployed on Vercel.

## Design decisions

**Hybrid retrieval.** Legal text is full of exact tokens that embeddings blur: "Section 116", "RA 11976", "3%". So every ask runs pgvector cosine and Postgres full-text search in parallel and fuses them with reciprocal rank fusion at k=60. The tradeoff is two queries and a fusion step instead of one index or a reranker, paid to keep exact-term recall without putting another model in the hot path.

**Citations by number, not UUID.** The model cites `[n]` markers that point at numbered context passages, and the server maps the numbers back to real chunk rows afterward. Models copy small integers reliably and hallucinate long identifiers, so asking for chunk IDs was never on the table. The tradeoff is a reconciliation step and one hard rule: an answer that ends up with zero valid citations is downgraded to a refusal.

**Deterministic gate.** When the best cosine similarity is under `RETRIEVAL_SIM_FLOOR` the API refuses before any model call, so off-corpus spam costs zero LLM tokens and refusals near the floor are reproducible. The tradeoff is a hand-tuned threshold: set it too low and it silently does nothing, which is exactly what the baseline caught (see findings).

**A custom TypeScript harness instead of RAGAS.** I wanted an eval client that only speaks to the deployed API, stamps every run with provenance (git commit, bank hash, corpus snapshot), and measures this system's failure modes: gate versus model refusals, doc-set stability, cost from reported token usage. RAGAS gives faithfulness metrics for free; the tradeoff is that I gave those up for now, and the README says so instead of pretending.

**Latency criterion revised from 10 s to 12 s.** I set p95 under 10 s before measuring anything. The baseline's worst per-category round-trip p95 is 11.3 s even though the overall p95 is well under 10, so I moved the criterion to 12 s and kept the measurement honest rather than tuning the system to hit a number I picked with no data.

**Answer model via env.** `ANSWER_MODEL` and `ANSWER_EFFORT` are environment config, so swapping models is a redeploy, not a code change, and the sweep the harness enables stays cheap. The tradeoff is config drift between environments; the mitigation is that every results file records the model that actually answered.

## Evaluation

The harness drives the deployed API over a committed bank of 48 labeled questions (8 categories, dev/test split), runs the test split three times sequentially, and scores with a pure function that CI tests against fixtures, so a run needs a live deployment but CI never needs the network. All numbers below come from `evals/baselines/2026-08-31-production.json`.

| Metric | Value |
|---|---|
| Test questions, runs | 34 questions, 3 runs, 102 rows (1 request error) |
| Retrieval hit rate (any expected doc in top 8) | 96.5% |
| All expected docs in top 8 | 71.4% |
| Correct-refusal rate on off-corpus questions | 100% |
| Off-corpus refusals caught at the gate | 0% |
| False-refusal rate on on-corpus questions | 4.1%, all from the model |
| Behavior stability across 3 runs | 97.0% |
| Doc-set stability across 3 runs | 88% |
| Latency p95, server scope (inside the API handler) | 8.3 s |
| Latency p95, round-trip scope (harness HTTP client) | 8.8 s |
| Question-runs with a keyword-leg chunk in the top 8 | 19.8% |
| Cost of the full run | $3.97 on claude-opus-5 |

What the baseline actually taught me:

- The floor never fires. Every off-corpus refusal came from the model, none from the gate. Answered runs never had a best similarity below 0.50 and refused runs never above 0.57, so there is measured room to raise the floor and make refusals cheaper.
- One question accounts for every retrieval miss and every false refusal: `trap-percentage-tax-2022-05` (the 2022 Section 116 rate) expected the NIRC and TRAIN but retrieved only RR 8-2018 and its digest in all three runs, and the model refused all three times.
- One question is unstable: `philhealth-self-earning-04` answered in runs 1 and 3 and model-refused in run 2. That single flip is the whole gap to 100% stability.
- The keyword leg contributes a top-8 chunk in 19.8% of question-runs and 10.1% of chunks. It earns its seat, but the vector leg does most of the work.

### Corpus-currency traps

Five bank questions are labeled with `supersededBy`: the corpus answers them faithfully, and the answer is stale in 2026. The baseline scores behavior only; disclosing staleness is future work, tracked in the bank itself.

| Question | Superseded by | Effective | What changed |
|---|---|---|---|
| Do I have to pay the 500 peso annual registration fee every January? | RA 11976 (Ease of Paying Taxes Act) | 2024-01-22 | annual registration fee under Section 236(B) abolished |
| Do I need to issue official receipts for my professional fees? | RA 11976 (Ease of Paying Taxes Act) | 2024-01-22 | invoices replace official receipts as the primary document for sales of services under Section 237 |
| What is the maximum monthly Pag-IBIG contribution for an employee? | HDMF Circular No. 460 | 2024-02-01 | monthly fund salary cap raised from 5,000 to 10,000 pesos, doubling the maximum member share from 100 to 200 pesos |
| What was the PhilHealth premium rate for 2023? | Malacañang memorandum (ES Bersamin, 2023-01-02), affirmed by PhilHealth board 2023-01-04 | 2023-01-01 | 2023 premium rate held at 4% instead of the scheduled 4.5% |
| What was the percentage tax rate for a non-VAT freelancer in 2022? | RA 11534 (CREATE Act) | 2020-07-01 | Section 116 percentage tax temporarily reduced from 3% to 1% until 2023-06-30; corpus states the 3% that applied before and after |

## Risks and mitigations

- `POST /api/ask` is public and every non-gated question spends answer-model tokens. Mitigations are operational: the pre-LLM gate, a spend cap on the Anthropic console, and platform rate limiting as config. Rate-limiting code is deliberately out of scope this milestone.
- Corpus currency. Philippine rules change and a faithful answer can still be stale. The traps above turn that risk into a measured number instead of a hope, and staleness disclosure is the named next stage.
- The ask route runs under a 60 s function ceiling (`maxDuration = 60`) and ingest under 300 s, with Vercel rejecting request bodies over about 4.5 MB, so the practical upload cap is 4.5 MB of text-based PDF. Larger corpora need job-based ingestion, deferred on purpose.

## What I'd improve next

- Sweep `RETRIEVAL_SIM_FLOOR` against the baseline; the 0.50 to 0.57 gap says the gate can start earning its keep.
- Tune the keyword leg, starting from the one Section 116 miss.
- Add staleness disclosure driven by the bank's `supersededBy` labels.
- Add answer-faithfulness judging to the harness.
- Add rate limiting to `/api/ask`.
- Move ingest to background jobs to lift the 4.5 MB / 300 s ceiling.

---

<details>
<summary><b>Setup and local development</b></summary>

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

### Environment variables

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

### Running the evals

```bash
EVAL_TARGET_URL=https://<deployment> npm run eval                # test split, 3 runs
EVAL_TARGET_URL=https://<deployment> npm run eval -- --runs 1 --split dev
npm run eval:score -- evals/results/<file>.json                  # re-score without re-running
```

A named baseline is written with `--baseline <label>`; the CLI refuses that when the tree is dirty or the run was interrupted, and a test enforces the same on every committed file.

</details>

<details>
<summary><b>API</b></summary>

Ingestion (`POST /api/ingest`, admin token) parses a PDF or Markdown file per page or per heading, chunks it to around 500 tokens with a 60-token overlap, embeds the chunks and stores everything in one transaction. A `corpus_meta` row pins the embedding provider, so ingesting with a different provider gets a 409 instead of silently mixing vector spaces.

Asking (`POST /api/ask`) embeds the question, runs pgvector cosine and tsvector full-text search in parallel (top 20 each), then fuses them with reciprocal rank fusion (k=60) to pick the top 8 chunks. A deterministic confidence gate refuses before any LLM call when the best similarity is below `RETRIEVAL_SIM_FLOOR`. Otherwise the answer model returns structured output, citations are reconciled on the server, and an answer with zero citations is downgraded to a refusal. An answer always carries at least one real citation.

`GET /api/stats` lists the documents, chunk counts and the pinned embedding provider.

Pass `"debug": true` to `/api/ask` to get read-only retrieval diagnostics, on refusals as well: per-chunk document title, leg ranks, similarity and RRF score, the gate values, and `usage` with the answer model and its input and output tokens (`null` when the gate refused before any model call). This is the hook the eval harness drives.

</details>

<details>
<summary><b>Deploy runbook (Vercel + Neon)</b></summary>

1. Create a Neon project and copy the pooled connection string.
2. Run `npm run migrate` with `DATABASE_URL` pointed at Neon, set in your shell or in `.env.local` (the migrate script reads that file as well).
3. Import the GitHub repo into Vercel, set all env vars above except `DATABASE_URL_TEST`, then deploy.
4. Visit `/upload`, enter `INGEST_TOKEN`, ingest the corpus PDFs.
5. Run `BASE_URL=https://<deployment> npm run latency` and check that p95 is under 12 s.
6. Ask "who won the 2022 PH election?" and confirm an explicit refusal with zero citations.

### Acceptance criteria and how they were verified

| Criterion | How verified |
|---|---|
| Vercel deployment live | URL loads |
| 50+ page BIR PDF ingests; chunk count queryable | `/upload`, then `GET /api/stats` |
| On-corpus answer with a citation resolving to a real chunk | ask on `/`; enforced by the reconciliation downgrade |
| p95 < 12 s over 10 queries | `npm run latency` against the deployment |
| Off-corpus refusal, zero citations | "who won the 2022 PH election?" |
| Tests pass in CI | GitHub Actions `ci` workflow |

</details>
