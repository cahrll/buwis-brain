"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";

interface Citation {
  index: number;
  chunkId: string;
  documentTitle: string;
  pageStart: number | null;
  pageEnd: number | null;
  heading: string | null;
  content: string;
}

interface AskResponse {
  refused: boolean;
  reason: string | null;
  answer: string | null;
  citations: Citation[];
  latencyMs: number;
}

interface Entry {
  question: string;
  response: AskResponse;
}

const REASON_MESSAGES: Record<string, string> = {
  low_confidence:
    "I can't answer that from the documents in this workspace, so I won't guess.",
  unsupported_answer:
    "I couldn't ground an answer in the documents in this workspace, so I won't guess.",
  model_declined: "The model declined to answer this question.",
  not_answerable:
    "The documents in this workspace don't answer that question, so I won't guess.",
};

export default function Home() {
  const [question, setQuestion] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `request failed (${res.status})`);
      setEntries((prev) => [{ question: q, response: json as AskResponse }, ...prev]);
      setQuestion("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <h1>buwis-brain</h1>
      <p>
        Ask about BIR tax rules and SSS/PhilHealth/Pag-IBIG contributions for PH
        freelancers. Answers cite the exact source passages.{" "}
        <a href="/upload">Manage corpus</a>
      </p>
      <form onSubmit={ask}>
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={3}
          cols={80}
          maxLength={1000}
          placeholder="e.g. Can I use the 8% income tax option as a freelancer?"
        />
        <br />
        <button type="submit" disabled={loading}>
          Ask
        </button>
      </form>
      {loading && <p>Thinking…</p>}
      {error && <p role="alert">Error: {error}</p>}
      {entries.map((entry, i) => (
        <article key={entries.length - i}>
          <hr />
          <h2>Q: {entry.question}</h2>
          {entry.response.refused ? (
            <p>
              <strong>No answer:</strong>{" "}
              {REASON_MESSAGES[entry.response.reason ?? ""] ??
                "I can't answer that from this corpus."}
            </p>
          ) : (
            <>
              <ReactMarkdown>{entry.response.answer ?? ""}</ReactMarkdown>
              <h3>Sources</h3>
              <ol>
                {entry.response.citations.map((c) => (
                  <li key={c.chunkId} value={c.index}>
                    <details>
                      <summary>
                        {c.documentTitle}
                        {c.pageStart !== null && `, pages ${c.pageStart}-${c.pageEnd}`}
                        {c.heading && `, ${c.heading}`}
                      </summary>
                      <blockquote>{c.content}</blockquote>
                    </details>
                  </li>
                ))}
              </ol>
            </>
          )}
          <p>
            <small>{entry.response.latencyMs} ms</small>
          </p>
        </article>
      ))}
    </main>
  );
}
