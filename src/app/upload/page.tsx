"use client";

import { useEffect, useState } from "react";
import { Badge, Chrome, Reminder } from "../../components/chrome";

interface StatsDocument {
  id: string;
  title: string;
  chunkCount: number;
  pageCount: number | null;
  createdAt: string;
}

interface Stats {
  documents: StatsDocument[];
  totalChunks: number;
  corpusMeta: { providerId: string; dimensions: number } | null;
}

type Result =
  | { kind: "ok"; text: string }
  | { kind: "err"; status: number | null; text: string };

const ERROR_HEADS: Record<number, string> = {
  401: "WRONG PASS",
  409: "PROVIDER MISMATCH",
  415: "WRONG CARGO",
  422: "CAN'T READ IT",
  502: "DEPOT OFFLINE",
};

const FIELD_LABEL =
  "mt-3.5 mb-[5px] block text-[0.72rem] leading-none font-bold uppercase tracking-label text-asphalt-muted";
const FIELD_INPUT =
  "block w-full max-w-[56ch] rounded-field border-2 border-signboard-ink bg-white px-2.5 py-2 text-[0.95rem] font-medium text-signboard-ink caret-signal-red placeholder:italic placeholder:text-asphalt-muted";

export default function Upload() {
  const [token, setToken] = useState("");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);

  async function loadStats() {
    try {
      const res = await fetch("/api/stats");
      if (res.ok) setStats((await res.json()) as Stats);
    } catch {
      // stats are best-effort on this page
    }
  }

  useEffect(() => {
    void loadStats();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || busy) return;
    setBusy(true);
    setResult(null);
    try {
      const form = new FormData();
      form.set("file", file);
      if (title.trim()) form.set("title", title.trim());
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "x-ingest-token": token },
        body: form,
      });
      const json = await res.json();
      if (!res.ok) {
        setResult({
          kind: "err",
          status: res.status,
          text: json.error ?? `request failed (${res.status})`,
        });
        return;
      }
      setResult({
        kind: "ok",
        text:
          `Ingested "${json.title}": ${json.chunkCount} chunks` +
          (json.pageCount ? ` across ${json.pageCount} pages` : "") +
          ` (document ${json.documentId}). It answers from the corpus immediately.`,
      });
      await loadStats();
    } catch (err) {
      setResult({
        kind: "err",
        status: null,
        text: err instanceof Error ? err.message : "request failed",
      });
    } finally {
      setBusy(false);
    }
  }

  const docs = stats?.documents ?? [];
  const totalPages = docs.reduce((sum, d) => sum + (d.pageCount ?? 0), 0);

  return (
    <main className="px-3 pt-[18px] pb-[30px] road:px-[30px] road:pt-[26px] road:pb-10">
      <Chrome active="corpus" />

      <div className="mx-auto mt-6 w-full max-w-[900px] rounded-strip border-3 border-signboard-ink bg-route-blue px-5 py-2.5 text-white shadow-topboard-hang inset-shadow-enamel-blue">
        <h2 className="font-slab text-base tracking-title text-shadow-paint-deep">CORPUS DEPOT</h2>
        <p className="mt-0.5 text-[0.8rem] leading-[1.4] font-medium text-blue-pinstripe">
          admin access: loading documents onto the route
        </p>
      </div>

      <form
        onSubmit={submit}
        className="mx-auto mt-3.5 w-full max-w-[900px] rounded-board border-3 border-signboard-ink bg-enamel-white px-3.5 py-[18px] shadow-board-hang inset-shadow-enamel-white road:px-[30px] road:pt-[22px] road:pb-6"
      >
        <h3 className="mb-2 font-slab text-base tracking-title text-signal-red text-shadow-paint">
          LOAD A DOCUMENT
        </h3>
        <label htmlFor="token" className={FIELD_LABEL}>
          Terminal pass &middot; admin token
        </label>
        <input
          id="token"
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Paste the admin token"
          className={FIELD_INPUT}
        />
        <label htmlFor="doc-title" className={FIELD_LABEL}>
          Document title &middot; optional
        </label>
        <input
          id="doc-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Defaults to the file&rsquo;s own title"
          className={FIELD_INPUT}
        />
        <label htmlFor="file" className={FIELD_LABEL}>
          Cargo &middot; PDF or Markdown
        </label>
        <div className="flex max-w-[56ch] flex-wrap items-center gap-3">
          <input
            id="file"
            type="file"
            accept=".pdf,.md,.markdown,application/pdf,text/markdown"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="peer sr-only"
          />
          <label
            htmlFor="file"
            className="cursor-pointer rounded-field border-2 border-signboard-ink bg-white px-3.5 py-2 font-condensed text-[0.82rem] leading-none font-semibold uppercase tracking-ghost text-signboard-ink peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-enamel-yellow hover:bg-butter-wash"
          >
            Choose file
          </label>
          <span className="min-w-0 wrap-anywhere text-[0.88rem] italic text-asphalt-muted">
            {file?.name ?? "No file chosen"}
          </span>
        </div>
        <p className="mt-[18px]">
          <button
            type="submit"
            disabled={busy || !file}
            className="cursor-pointer rounded-control border-3 border-signboard-ink bg-signal-red px-6 py-2 font-slab text-[0.95rem] tracking-slab text-white text-shadow-paint-deep hover:bg-red-pressed disabled:cursor-default disabled:bg-steel-mist disabled:text-shadow-none"
          >
            {busy ? "Loading…" : "Load it"}
          </button>
        </p>

        {busy && file && (
          <div role="status" className="mt-[18px] border-t-2 border-signboard-ink pt-3">
            <p className="text-[0.88rem] font-semibold text-route-blue">
              Hauling {file.name}: parsing, chunking, and embedding&hellip;
            </p>
            <div className="road-track" aria-hidden="true">
              <div className="road-fill" />
            </div>
          </div>
        )}

        {!busy && result?.kind === "ok" && (
          <div
            role="status"
            className="mt-[18px] max-w-[60ch] rounded-strip border-3 border-signboard-ink bg-route-blue px-[18px] py-3.5 text-white inset-shadow-enamel-blue"
          >
            <h4 className="mb-1.5 font-slab text-[0.95rem] tracking-title text-shadow-paint-deep">
              LOADED
            </h4>
            <p className="text-[0.9rem] leading-[1.6]">{result.text}</p>
          </div>
        )}

        {!busy && result?.kind === "err" && (
          <div
            role="alert"
            className="relative mt-[18px] max-w-[60ch] rounded-strip border-3 border-signboard-ink bg-signal-red px-[18px] py-3.5 text-white inset-shadow-enamel-red"
          >
            {result.status !== null && (
              <span className="absolute top-3 right-3.5 rounded-field border-2 border-signboard-ink bg-enamel-white px-2.5 py-1.5 text-[0.9rem] leading-none font-bold text-signal-red">
                {result.status}
              </span>
            )}
            <h4 className="mb-2 pr-[70px] font-slab text-[1.05rem] tracking-title text-shadow-paint-heavy">
              {(result.status !== null && ERROR_HEADS[result.status]) || "NOT LOADED"}
            </h4>
            <p className="rounded-box border-2 border-signboard-ink bg-enamel-white px-3.5 py-2.5 text-[0.9rem] leading-[1.6] text-signboard-ink">
              {result.text}
            </p>
          </div>
        )}
      </form>

      <div className="mx-auto mt-[26px] w-full max-w-[900px]">
        <h3 className="mb-3 font-slab text-[1.05rem] tracking-title text-enamel-yellow text-shadow-asphalt">
          ON THE RACK{stats ? ` · ${docs.length} ${docs.length === 1 ? "DOCUMENT" : "DOCUMENTS"}` : ""}
        </h3>
        {!stats ? (
          <p className="text-[0.8rem] font-medium italic text-steel-mist">Checking the rack&hellip;</p>
        ) : docs.length === 0 ? (
          <div className="rounded-strip border-3 border-dashed border-steel-mist bg-enamel-white px-6 py-5">
            <p className="max-w-[60ch] text-[0.95rem] leading-[1.65] text-signboard-ink">
              No documents on this route yet. Load the first file above and it will be chunked,
              embedded, and hung on the rack here.
            </p>
          </div>
        ) : (
          <>
            {docs.map((d) => (
              <div
                key={d.id}
                className="mb-2.5 flex flex-wrap items-center gap-3 rounded-strip border-3 border-signboard-ink bg-enamel-white px-4 py-2.5 shadow-strip-hang road:flex-nowrap"
              >
                <span className="w-full min-w-0 flex-1 font-condensed text-[0.98rem] leading-[1.3] font-semibold uppercase tracking-title road:w-auto">
                  {d.title}
                </span>
                <Badge>{d.chunkCount} chunks</Badge>
                {d.pageCount ? <Badge>{d.pageCount} pages</Badge> : null}
              </div>
            ))}
            <div className="mb-2.5 flex flex-wrap items-center gap-3 rounded-strip border-3 border-signboard-ink bg-route-blue px-4 py-2.5 text-white shadow-strip-hang inset-shadow-enamel-blue road:flex-nowrap">
              <span className="w-full min-w-0 flex-1 font-condensed text-[0.98rem] leading-[1.3] font-semibold uppercase tracking-title road:w-auto">
                Total
              </span>
              <Badge invert>{docs.length} documents</Badge>
              <Badge invert>{stats.totalChunks} chunks</Badge>
              {totalPages > 0 && <Badge invert>{totalPages} pages</Badge>}
            </div>
            {stats.corpusMeta && (
              <p className="mt-2.5 text-[0.8rem] font-medium italic text-steel-mist">
                Embeddings: {stats.corpusMeta.providerId} &middot; {stats.corpusMeta.dimensions}{" "}
                dimensions
              </p>
            )}
          </>
        )}
      </div>

      <Reminder />
    </main>
  );
}
