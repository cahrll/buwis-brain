"use client";

import { Fragment, cloneElement, isValidElement, useState } from "react";
import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import { BigPlate, Badge, Chrome, Plate, RefusalSign, Reminder } from "../components/chrome";

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

const SAMPLE_QUESTIONS = [
  "Can I choose the 8% income tax option instead of graduated rates?",
  "How much is the SSS contribution for self-employed members?",
  "Do I have to register with the BIR if all my clients are abroad?",
];

/** Replace inline [n] citation markers with route plates, preserving other nodes. */
function withPlates(children: ReactNode): ReactNode {
  if (typeof children === "string") {
    const parts = children.split(/\[(\d{1,2})\]/g);
    if (parts.length === 1) return children;
    return parts.map((part, i) =>
      i % 2 === 1 ? <Plate key={i} n={Number(part)} /> : <Fragment key={i}>{part}</Fragment>,
    );
  }
  if (Array.isArray(children)) {
    return children.map((child, i) => <Fragment key={i}>{withPlates(child)}</Fragment>);
  }
  if (isValidElement(children)) {
    const props = children.props as { children?: ReactNode };
    if (props.children !== undefined) {
      return cloneElement(children, undefined, withPlates(props.children));
    }
  }
  return children;
}

const MD_COMPONENTS: Components = {
  p: ({ children }) => <p className="mt-3.5 first:mt-0">{withPlates(children)}</p>,
  strong: ({ children }) => <strong className="font-bold text-route-blue">{children}</strong>,
  ul: ({ children }) => <ul className="mt-3.5 list-disc pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="mt-3.5 list-decimal pl-5">{children}</ol>,
  li: ({ children }) => <li className="mt-1">{withPlates(children)}</li>,
};

const BOARD_HEAD =
  "mb-3 font-slab text-base tracking-title text-signal-red text-shadow-paint";

function pageBadge(c: Citation): string | null {
  if (c.pageStart === null) return null;
  return c.pageEnd !== null && c.pageEnd !== c.pageStart
    ? `p. ${c.pageStart}-${c.pageEnd}`
    : `p. ${c.pageStart}`;
}

export default function Home() {
  const [question, setQuestion] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  async function submit(q: string) {
    if (!q || loading) return;
    setLoading(true);
    setError(null);
    setPending(q);
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
      setPending(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "request failed");
    } finally {
      setLoading(false);
    }
  }

  function ask(e: React.FormEvent) {
    e.preventDefault();
    submit(question.trim());
  }

  function promote(index: number) {
    setEntries((prev) => [prev[index], ...prev.filter((_, i) => i !== index)]);
  }

  const current = !loading && !error ? entries[0] : undefined;
  const shownQuestion = loading || error ? pending : (current?.question ?? null);
  const stickerEntries = current ? entries.slice(1) : entries;
  const stickerOffset = current ? 1 : 0;

  return (
    <main className="px-3 pt-[18px] pb-[30px] road:px-[30px] road:pt-[26px] road:pb-10">
      <Chrome active="ask" />

      <form
        onSubmit={ask}
        className="mx-auto mt-6 flex w-full max-w-[900px] flex-wrap items-center gap-3.5 rounded-board border-3 border-signboard-ink bg-enamel-white px-3.5 py-3 shadow-topboard-hang inset-shadow-enamel-white road:flex-nowrap"
      >
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={1}
          maxLength={1000}
          aria-label="Ask about BIR, SSS, PhilHealth, or Pag-IBIG"
          placeholder="Where to? Ask about BIR, SSS, PhilHealth, or Pag-IBIG…"
          className="max-h-40 min-w-0 flex-1 basis-full resize-none border-0 bg-transparent px-2 py-1.5 text-[1.05rem] font-medium text-signboard-ink [field-sizing:content] placeholder:italic placeholder:text-asphalt-muted road:basis-auto"
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full cursor-pointer rounded-control border-3 border-signboard-ink bg-signal-red px-[22px] py-2 font-slab text-[0.95rem] tracking-slab text-white text-shadow-paint-deep hover:bg-red-pressed disabled:cursor-default disabled:bg-steel-mist disabled:text-shadow-none road:w-auto"
        >
          Ask
        </button>
      </form>

      {shownQuestion && (
        <h2 className="mx-auto mt-6 w-full max-w-[900px] rounded-strip border-3 border-signboard-ink bg-enamel-yellow px-[22px] py-3 font-condensed text-[1.05rem] leading-[1.35] font-semibold text-signboard-ink shadow-topboard-hang road:text-[1.2rem]">
          <span className="mb-[5px] block font-barlow text-[0.72rem] leading-none font-bold uppercase tracking-strap text-yellow-shade">
            Your question
          </span>
          {shownQuestion}
        </h2>
      )}

      {loading && (
        <article
          role="status"
          className="mx-auto mt-3.5 w-full max-w-[900px] rounded-board border-3 border-route-blue bg-enamel-white px-4 py-[18px] shadow-board-hang inset-shadow-answer road:px-[30px] road:pt-6 road:pb-5"
        >
          <h3 className={BOARD_HEAD}>EN ROUTE…</h3>
          <div className="roadline mb-3.5" aria-hidden="true" />
          <p className="max-w-[68ch] text-[0.95rem] leading-[1.72] text-reading-soft road:text-base">
            Reading the route: retrieving sources and writing the answer. Usually under ten
            seconds.
          </p>
        </article>
      )}

      {!loading && error && (
        <section className="hazard-top relative mx-auto mt-3.5 w-full max-w-[900px] overflow-hidden rounded-board border-3 border-signboard-ink bg-enamel-white px-4 py-5 shadow-board-hang road:px-[26px]">
          <h3 className="mt-2.5 mb-2 font-slab text-[1.4rem] leading-none tracking-slab text-signal-red text-shadow-paint">
            STALLED
          </h3>
          <p role="alert" className="max-w-[64ch] text-[0.95rem] leading-[1.65] text-signboard-ink">
            The request failed: {error}. Your question is still in the board above; start the
            engine again.
          </p>
          <p className="mt-3.5">
            <button
              type="button"
              onClick={() => submit(pending ?? question.trim())}
              className="cursor-pointer rounded-control border-3 border-signboard-ink bg-enamel-yellow px-[22px] py-2 font-slab text-[0.95rem] text-signboard-ink hover:bg-yellow-pressed"
            >
              Try again
            </button>
          </p>
        </section>
      )}

      {!loading && !error && !current && (
        <>
          <article className="mx-auto mt-6 w-full max-w-[900px] rounded-board border-3 border-route-blue bg-enamel-white px-4 py-[18px] shadow-board-hang inset-shadow-answer road:px-[30px] road:pt-6 road:pb-5">
            <h3 className={BOARD_HEAD}>NO TRIPS YET TONIGHT</h3>
            <p className="max-w-[68ch] text-[0.95rem] leading-[1.72] road:text-base">
              Ask anything about BIR income tax, SSS, PhilHealth, or Pag-IBIG obligations for
              freelancers. Every answer arrives with numbered plates pointing at the exact
              passages it came from, or it does not arrive at all.
            </p>
          </article>
          <div className="mx-auto mt-[22px] flex w-full max-w-[900px] flex-col gap-2.5">
            <span className="text-[0.72rem] leading-none font-bold uppercase tracking-micro text-steel-mist">
              Try a route
            </span>
            {SAMPLE_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setQuestion(q)}
                className="max-w-[620px] cursor-pointer rounded-control border-3 border-signboard-ink bg-enamel-white px-4 py-2.5 text-left font-condensed text-[0.95rem] leading-[1.4] font-semibold tracking-chip text-signboard-ink shadow-chip-hang hover:bg-butter-wash"
              >
                {q}
              </button>
            ))}
          </div>
        </>
      )}

      {current && current.response.refused && (
        <section className="mx-auto mt-3.5 grid w-full max-w-[900px] grid-cols-1 items-center gap-x-5 gap-y-1.5 rounded-board border-3 border-signboard-ink bg-signal-red px-4 py-5 text-white shadow-board-hang inset-shadow-enamel-red road:grid-cols-[64px_minmax(0,1fr)] road:px-[26px]">
          <RefusalSign />
          <h3 className="font-slab text-[1.4rem] leading-none tracking-slab text-shadow-paint-heavy">
            {current.response.reason === "low_confidence" ? "OFF THE ROUTE" : "NO ENTRY"}
          </h3>
          <p className="text-[0.95rem] leading-[1.5] font-medium italic text-red-tint">
            {current.response.reason === "low_confidence"
              ? "Zero sources attached: nothing retrieved cleared the confidence floor, so the question never reached the model."
              : "The road exists, but the answer is not supported: the model read the retrieved passages and declined."}
          </p>
          <p className="max-w-[64ch] rounded-box border-2 border-signboard-ink bg-enamel-white px-3.5 py-2.5 text-[0.9rem] leading-[1.6] text-signboard-ink">
            {REASON_MESSAGES[current.response.reason ?? ""] ??
              "I can't answer that from this corpus."}
          </p>
        </section>
      )}

      {current && !current.response.refused && (
        <>
          <article className="mx-auto mt-3.5 w-full max-w-[900px] rounded-board border-3 border-route-blue bg-enamel-white px-4 py-[18px] shadow-board-hang inset-shadow-answer road:px-[30px] road:pt-6 road:pb-5">
            <h3 className={BOARD_HEAD}>HERE&rsquo;S THE ANSWER</h3>
            <div className="max-w-[68ch] text-[0.95rem] leading-[1.72] road:text-base">
              <ReactMarkdown components={MD_COMPONENTS}>
                {current.response.answer ?? ""}
              </ReactMarkdown>
            </div>
            <p className="mt-3.5 text-[0.8rem] font-medium italic text-asphalt-muted">
              Answered in {(current.response.latencyMs / 1000).toFixed(1)} s
            </p>
          </article>
          <div className="mx-auto mt-6 w-full max-w-[900px]">
            <h3 className="mb-3 font-slab text-[1.05rem] tracking-title text-enamel-yellow text-shadow-asphalt">
              WHERE&rsquo;S THIS FROM? {current.response.citations.length}{" "}
              {current.response.citations.length === 1 ? "SOURCE" : "SOURCES"}
            </h3>
            {current.response.citations.map((c, i) => (
              <details
                key={c.chunkId}
                open={i === 0}
                className="mb-2.5 overflow-hidden rounded-strip border-3 border-signboard-ink bg-enamel-white shadow-strip-hang"
              >
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3.5 px-4 py-2.5 hover:bg-butter-wash [&::-webkit-details-marker]:hidden road:flex-nowrap">
                  <BigPlate n={c.index} />
                  <span className="min-w-0 font-condensed text-base leading-[1.3] font-semibold uppercase tracking-title">
                    {c.documentTitle}
                    {c.heading && (
                      <span className="normal-case tracking-normal text-asphalt-muted">
                        {" "}
                        &middot; {c.heading}
                      </span>
                    )}
                  </span>
                  {pageBadge(c) && (
                    <span className="ml-[44px] road:ml-auto">
                      <Badge>{pageBadge(c)}</Badge>
                    </span>
                  )}
                </summary>
                <blockquote className="border-t-3 border-enamel-yellow bg-quote-cream px-[18px] py-3 text-[0.88rem] leading-[1.6] italic text-reading-soft road:pl-[60px]">
                  {c.content}
                </blockquote>
              </details>
            ))}
          </div>
        </>
      )}

      <Reminder />

      {stickerEntries.length > 0 && (
        <div className="mx-auto mt-[26px] flex w-full max-w-[900px] flex-wrap items-start gap-3">
          <span className="w-full text-[0.72rem] leading-none font-bold uppercase tracking-micro text-steel-mist">
            Previous trips
          </span>
          {stickerEntries.map((entry, i) => {
            const r = entry.response;
            const status = r.refused
              ? r.reason === "low_confidence"
                ? "Off the route"
                : "No entry"
              : `Answered · ${r.citations.length} ${r.citations.length === 1 ? "source" : "sources"}`;
            return (
              <button
                key={entries.indexOf(entry)}
                type="button"
                onClick={() => promote(i + stickerOffset)}
                className={`w-full cursor-pointer rounded-field border-2 border-signboard-ink px-3 py-[7px] text-left font-condensed text-[0.8rem] leading-[1.35] font-semibold tracking-chip text-signboard-ink shadow-chip-hang road:w-auto road:max-w-[230px] ${
                  i === 0
                    ? "bg-enamel-yellow hover:bg-yellow-pressed road:-rotate-[1.6deg]"
                    : "bg-enamel-white hover:bg-butter-wash"
                }`}
              >
                {entry.question}
                <em className="mt-0.5 block font-barlow text-[0.72rem] font-medium text-route-blue">
                  {status}
                </em>
              </button>
            );
          })}
        </div>
      )}
    </main>
  );
}
