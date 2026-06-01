"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { archiveVideoIdea, restoreVideoIdea, archiveYoutubeIdea, restoreYoutubeIdea } from "@/app/actions";

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
  archived_at: string | null;
  created_at: string;
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

// ----- YouTube helpers -----

function ytStage(idea: YoutubeIdea): "idea" | "prepped" | "filmed" | "posted" | "archived" {
  if (idea.archived_at) return "archived";
  if (idea.status === "prepped") return "prepped";
  if (idea.status === "filmed") return "filmed";
  if (idea.status === "posted") return "posted";
  return "idea";
}

const YT_STAGE_LABEL: Record<string, string> = {
  idea: "Idea",
  prepped: "Prepped",
  filmed: "Filmed",
  posted: "Posted",
  archived: "Archived",
};

export function reactionPrompt(idea: { id: string; title: string }) {
  return `Use the youtube-reaction-prep skill on the YouTube concept "${idea.title}" — youtube_ideas id ${idea.id}`;
}

function shortFormat(format: string | null): string | null {
  if (!format) return null;
  // The first clause before a dash/period is the format archetype.
  const clause = format.split(/[—–\-.:]/)[0].trim();
  const out = clause.length > 0 ? clause : format.trim();
  return out.length > 46 ? out.slice(0, 44).trimEnd() + "…" : out;
}

function firstSourceDomain(idea: YoutubeIdea): string | null {
  const hay = `${idea.notes ?? ""} ${idea.description ?? ""}`;
  const m = hay.match(/https?:\/\/([^/\s)]+)/i);
  if (!m) return null;
  return m[1].replace(/^www\./, "");
}

export function IdeasClient({
  dataset,
  videoIdeas,
  youtubeIdeas,
}: {
  dataset: string;
  videoIdeas: VideoIdea[];
  youtubeIdeas: YoutubeIdea[];
}) {
  const router = useRouter();
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

  async function copyText(id: string, text: string, toastMsg: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
    setCopiedId(id);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopiedId(null), 1600);
    showToast(toastMsg);
  }

  function copyVideoPrompt(id: string) {
    copyText(id, `Run the idea-to-script skill on idea #${id}`, "Prompt copied — paste into Claude Code");
  }

  function copyReactionPrompt(idea: YoutubeIdea) {
    copyText(idea.id, reactionPrompt(idea), "Reaction-prep prompt copied");
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

  function onArchiveYt(id: string) {
    startTransition(async () => {
      await archiveYoutubeIdea(id);
      showToast("Concept archived");
    });
  }

  function onRestoreYt(id: string) {
    startTransition(async () => {
      await restoreYoutubeIdea(id);
      showToast("Concept restored");
    });
  }

  if (dataset === "youtube") {
    return (
      <>
        {youtubeIdeas.length === 0 ? (
          <div className="empty">
            <div className="empty__mark">❦</div>
            <p className="empty__txt">No concepts under this filter.</p>
          </div>
        ) : (
          <section className="yt-list">
            {youtubeIdeas.map((idea) => {
              const stage = ytStage(idea);
              const isCopied = copiedId === idea.id;
              const fmt = shortFormat(idea.format);
              const domain = firstSourceDomain(idea);
              const date = formatDate(idea.created_at);
              const sub = idea.description || idea.hypothesis || "";
              const open = () => router.push(`/ideas/youtube/${idea.id}`);
              return (
                <article
                  key={idea.id}
                  className="yt-row"
                  data-stage={stage}
                  onClick={open}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      open();
                    }
                  }}
                >
                  <span className={`yt-stage yt-stage--${stage}`}>
                    <span className="yt-stage__dot" /> {YT_STAGE_LABEL[stage]}
                  </span>

                  <div className="yt-row__main">
                    <h3 className="yt-row__title">{idea.title}</h3>
                    {sub && <p className="yt-row__sub">{sub}</p>}
                    <div className="yt-row__meta">
                      {fmt && <span className="yt-row__fmt">{fmt}</span>}
                      {domain && (
                        <>
                          <span className="sep" />
                          <span className="yt-row__src">
                            <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                              <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.1" />
                              <path d="M1.5 6 H10.5 M6 1.5 C8 4 8 8 6 10.5 C4 8 4 4 6 1.5" stroke="currentColor" strokeWidth="1.1" />
                            </svg>
                            {domain}
                          </span>
                        </>
                      )}
                      <span className="sep" />
                      <span className="yt-row__date">{date.label}</span>
                      <span className="sep" />
                      <span className="yt-row__id"><span className="hash">#</span>{shortId(idea.id)}</span>
                    </div>
                  </div>

                  <div className="yt-row__actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      className={"action action--primary" + (isCopied ? " action--copied" : "")}
                      onClick={() => copyReactionPrompt(idea)}
                      title="Copy reaction-prep prompt for Claude Code"
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
                          <PrepIcon />
                          <span>Prep reaction</span>
                        </>
                      )}
                    </button>
                    {stage === "archived" ? (
                      <button
                        className="action action--icon"
                        onClick={() => onRestoreYt(idea.id)}
                        title="Restore from archive"
                        disabled={pending}
                      >
                        <RestoreIcon />
                      </button>
                    ) : (
                      <button
                        className="action action--icon"
                        onClick={() => onArchiveYt(idea.id)}
                        title="Archive concept"
                        disabled={pending}
                      >
                        <ArchiveIcon />
                      </button>
                    )}
                    <span className="yt-row__chev" aria-hidden="true">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M5 3 L9 7 L5 11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
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
                onClick={() => copyVideoPrompt(idea.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    copyVideoPrompt(idea.id);
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
                    onClick={() => copyVideoPrompt(idea.id)}
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
                      <ArchiveIcon />
                    </button>
                  )}
                  {status === "archived" && (
                    <button
                      className="action action--icon"
                      onClick={() => onRestore(idea.id)}
                      title="Restore from archive"
                      disabled={pending}
                    >
                      <RestoreIcon />
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

function PrepIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
      <path d="M3 1.5 H7.5 L10 4 V10.5 H3 Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M4.6 5.4 L5.8 6.6 L8 4.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArchiveIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
      <rect x="2" y="3" width="10" height="2" rx="0.6" stroke="currentColor" strokeWidth="1.3" />
      <path d="M3 5 V11 H11 V5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5.5 7.5 H8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function RestoreIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
      <path d="M3 7 A4 4 0 1 0 5 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="none" />
      <path d="M3 2 V4 H5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
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
