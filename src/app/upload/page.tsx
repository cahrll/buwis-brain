"use client";

import { useEffect, useState } from "react";

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

export default function Upload() {
  const [token, setToken] = useState("");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
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
    setMessage(null);
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
      if (!res.ok) throw new Error(json.error ?? `request failed (${res.status})`);
      setMessage(
        `Ingested "${json.title}", ${json.chunkCount} chunks` +
          (json.pageCount ? ` across ${json.pageCount} pages` : "") +
          ` (document ${json.documentId})`,
      );
      await loadStats();
    } catch (err) {
      setMessage(`Error: ${err instanceof Error ? err.message : "request failed"}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>Corpus admin</h1>
      <p>
        <a href="/">← back to ask</a>
      </p>
      <form onSubmit={submit}>
        <p>
          <label>
            Admin token{" "}
            <input type="password" value={token} onChange={(e) => setToken(e.target.value)} />
          </label>
        </p>
        <p>
          <label>
            Title (optional){" "}
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
        </p>
        <p>
          <input
            type="file"
            accept=".pdf,.md,.markdown,application/pdf,text/markdown"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </p>
        <button type="submit" disabled={busy || !file}>
          {busy ? "Ingesting…" : "Ingest"}
        </button>
      </form>
      {message && <p role="status">{message}</p>}
      <h2>Corpus</h2>
      {stats ? (
        <>
          <p>
            {stats.totalChunks} chunks total
            {stats.corpusMeta && `, embedded with ${stats.corpusMeta.providerId}`}
          </p>
          <ul>
            {stats.documents.map((d) => (
              <li key={d.id}>
                {d.title}, {d.chunkCount} chunks
                {d.pageCount ? `, ${d.pageCount} pages` : ""}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p>Loading…</p>
      )}
    </main>
  );
}
