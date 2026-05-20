"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { archiveVideoIdea, restoreVideoIdea } from "@/app/actions";

type VideoIdea = {
  id: string;
  transcript: string;
  recorded: boolean;
  ideation_status: string | null;
  created_at: string;
  script_id: string | null;
};

type YoutubeIdea = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  notes: string | null;
  format: string | null;
  hypothesis: string | null;
  result: string | null;
  verdict: string | null;
  lesson: string | null;
  filmed_at: string | null;
};

function shortId(id: string) {
  return id.replace(/-/g, "").slice(0, 6);
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const ms = today.setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0);
  const diffDays = Math.floor(ms / (1000 * 60 * 60 * 24));
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (diffDays === 0) return { label: "Today", time };
  if (diffDays === 1) return { label: "Yesterday", time };
  return {
    label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase(),
    time,
  };
}

function getSlipStatus(idea: VideoIdea): "fresh" | "recorded" | "archived" {
  if (idea.ideation_status === "archived") return "archived";
  if (idea.recorded) return "recorded";
  return "fresh";
}

const STATUS_LABEL: Record<string, string> = {
  fresh: "Fresh",
  recorded: "Recorded",
  archived: "Archived",
};

export function IdeasClient({
  dataset,
  videoIdeas,
  youtubeIdeas,
}: {
  dataset: string;
  videoIdeas: VideoIdea[];
  youtubeIdeas: YoutubeIdea[];
}) {
  const [toast, setToast] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
  }, []);

  function showToast(text: string) {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  }

  async function copyPrompt(id: string) {
    const text = `Run the idea-to-script skill on idea #${id}`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
    setCopiedId(id);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopiedId(null), 1600);
    showToast("Prompt copied — paste into Claude Code");
  }

  function onArchive(id: string) {
    startTransition(async () => {
      await archiveVideoIdea(id);
      showToast("Archived");
    });
  }

  function onRestore(id: string) {
    startTransition(async () => {
      await restoreVideoIdea(id);
      showToast("Restored");
    });
  }

  if (dataset === "youtube") {
    return (
      <>
        {youtubeIdeas.length === 0 ? (
          <div className="empty">
            <div className="empty__mark">❦</div>
            <p className="empty__txt">No YouTube concepts yet.</p>
          </div>
        ) : (
          <section className="yt-grid">
            {youtubeIdeas.map((idea) => {
              const isCopied = copiedId === idea.id;
              return (
                <article
                  key={idea.id}
                  className="yt-card"
                  onClick={() => copyPrompt(idea.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      copyPrompt(idea.id);
                    }
                  }}
                >
                  <div className="yt-card__top">
                    <span className={`status status--${idea.status}`}>
                      <span className="dot" /> {idea.status}
                    </span>
                    {idea.format && (
                      <>
                        <span className="sep" />
                        <span>{idea.format}</span>
                      </>
                    )}
                    {idea.filmed_at && (
                      <>
                        <span className="sep" />
                        <span>filmed {idea.filmed_at}</span>
                      </>
                    )}
                  </div>
                  <h2 className="yt-card__title">{idea.title}</h2>
                  {idea.description && <p className="yt-card__desc">{idea.description}</p>}
                  <div className="yt-card__fields">
                    {idea.hypothesis && (
                      <div className="yt-field">
                        <div className="yt-field__k">Hypothesis</div>
                        <div className="yt-field__v">{idea.hypothesis}</div>
                      </div>
                    )}
                    {idea.result && (
                      <div className="yt-field">
                        <div className="yt-field__k">Result</div>
                        <div className="yt-field__v yt-field__v--mono">{idea.result}</div>
                      </div>
                    )}
                    {idea.verdict && (
                      <div className="yt-field">
                        <div className="yt-field__k">Verdict</div>
                        <div className="yt-field__v">{idea.verdict}</div>
                      </div>
                    )}
                    {idea.lesson && (
                      <div className="yt-field">
                        <div className="yt-field__k">Lesson</div>
                        <div className="yt-field__v">{idea.lesson}</div>
                      </div>
                    )}
                    {idea.notes && (
                      <div className="yt-field">
                        <div className="yt-field__k">Notes</div>
                        <div className="yt-field__v">{idea.notes}</div>
                      </div>
                    )}
                  </div>
                  <div className="yt-card__foot">
                    <button
                      className={"action action--primary" + (isCopied ? " action--copied" : "")}
                      onClick={(e) => {
                        e.stopPropagation();
                        copyPrompt(idea.id);
                      }}
                    >
                      {isCopied ? (
                        <>
                          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                            <path d="M2.5 6 L5 8.5 L9.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <CopyIcon />
                          <span>Copy prompt</span>
                        </>
                      )}
                    </button>
                    <span className="yt-spacer" />
                    <span className="yt-card__id">#{idea.id}</span>
                  </div>
                </article>
              );
            })}
          </section>
        )}
        <Toast text={toast} />
      </>
    );
  }

  return (
    <>
      {videoIdeas.length === 0 ? (
        <div className="empty">
          <div className="empty__mark">❦</div>
          <p className="empty__txt">No ideas here. The notebook is empty under this filter.</p>
        </div>
      ) : (
        <section className="slips">
          {videoIdeas.map((idea) => {
            const status = getSlipStatus(idea);
            const date = formatDate(idea.created_at);
            const sid = shortId(idea.id);
            const isCopied = copiedId === idea.id;
            return (
              <article
                key={idea.id}
                className="slip"
                data-status={status}
                onClick={() => copyPrompt(idea.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    copyPrompt(idea.id);
                  }
                }}
              >
                <aside className="slip__aside">
                  <div className="slip__date">{date.label}</div>
                  <div className="slip__time">{date.time}</div>
                  <div className="slip__id"><span className="hash">#</span>{sid}</div>
                </aside>

                <div className="slip__body">
                  <p className="slip__transcript slip__transcript--clamped">{idea.transcript}</p>
                  <div className="slip__meta">
                    <span className="source">
                      <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                        <path d="M14 3 L2 8 L6 10 L8 14 L14 3 Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                      </svg>
                      Telegram
                    </span>
                    <span className="sep" />
                    <span className="status">{STATUS_LABEL[status]}</span>
                    {idea.script_id && (
                      <>
                        <span className="sep" />
                        <span className="slip__script-link">
                          <svg viewBox="0 0 12 12" fill="none">
                            <path d="M3 2 H8 L10 4 V10 H3 Z" stroke="currentColor" strokeWidth="1.2" />
                          </svg>
                          scr_{idea.script_id.replace(/-/g, "").slice(0, 4)}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="slip__actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    className={"action action--primary" + (isCopied ? " action--copied" : "")}
                    onClick={() => copyPrompt(idea.id)}
                    title="Copy prompt for Claude Code"
                  >
                    {isCopied ? (
                      <>
                        <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                          <path d="M2.5 6 L5 8.5 L9.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <CopyIcon />
                        <span>Copy prompt</span>
                      </>
                    )}
                  </button>
                  {status === "fresh" && (
                    <button
                      className="action action--icon"
                      onClick={() => onArchive(idea.id)}
                      title="Archive idea"
                      disabled={pending}
                    >
                      <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                        <rect x="2" y="3" width="10" height="2" rx="0.6" stroke="currentColor" strokeWidth="1.3" />
                        <path d="M3 5 V11 H11 V5" stroke="currentColor" strokeWidth="1.3" />
                        <path d="M5.5 7.5 H8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                      </svg>
                    </button>
                  )}
                  {status === "archived" && (
                    <button
                      className="action action--icon"
                      onClick={() => onRestore(idea.id)}
                      title="Restore from archive"
                      disabled={pending}
                    >
                      <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                        <path d="M3 7 A4 4 0 1 0 5 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="none" />
                        <path d="M3 2 V4 H5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      )}
      <Toast text={toast} />
    </>
  );
}

function CopyIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
      <rect x="3" y="3" width="7" height="7" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2 8 V2.2 C2 2 2 2 2.2 2 H7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function Toast({ text }: { text: string | null }) {
  return (
    <div className={"toast" + (text ? " show" : "")}>
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M2.5 7 L5.5 10 L11.5 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>{text ?? ""}</span>
    </div>
  );
}
