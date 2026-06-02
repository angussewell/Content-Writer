"use client";

import { useState, useRef, useEffect, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import TextareaAutosize from "react-textarea-autosize";
import {
  archiveYoutubeIdea,
  restoreYoutubeIdea,
  updateYoutubeNotes,
  updateYoutubeTitle,
  updateYoutubeStage,
} from "@/app/actions";
import { reactionPrompt } from "@/app/ideas/IdeasClient";
import { Markdown } from "@/components/Markdown";

type Stage = "idea" | "prepped" | "filmed" | "posted" | "archived";

const STAGE_LABEL: Record<Stage, string> = {
  idea: "Idea",
  prepped: "Prepped",
  filmed: "Filmed",
  posted: "Posted",
  archived: "Archived",
};
const STAGE_ORDER: Stage[] = ["idea", "prepped", "filmed", "posted"];

export type DetailProps = {
  id: string;
  title: string;
  description: string | null;
  stage: Stage;
  archived: boolean;
  notes: string;
  format: string | null;
  hypothesis: string | null;
  result: string | null;
  verdict: string | null;
  lesson: string | null;
  sources: string[];
  createdLabel: string | null;
  filmedLabel: string | null;
};

function readingStats(text: string) {
  const words = (text.trim().match(/\S+/g) ?? []).length;
  const mins = Math.max(1, Math.round(words / 180));
  return { words, mins };
}

export function YoutubeDetailClient(props: DetailProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1900);
  }, []);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  return (
    <div className="ytd2">
      <DocHeader {...props} showToast={showToast} startTransition={startTransition} router={router} />
      <Properties {...props} />
      <NotesDoc id={props.id} initialNotes={props.notes} showToast={showToast} />
      <div className={"toast" + (toast ? " show" : "")}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M2.5 7 L5.5 10 L11.5 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>{toast ?? ""}</span>
      </div>
    </div>
  );
}

/* ── Header: stage, title (editable), description, actions ───────────── */

function DocHeader({
  id,
  title,
  description,
  stage,
  archived,
  createdLabel,
  filmedLabel,
  showToast,
  startTransition,
  router,
}: DetailProps & {
  showToast: (t: string) => void;
  startTransition: ReturnType<typeof useTransition>[1];
  router: ReturnType<typeof useRouter>;
}) {
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // title editing
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleVal, setTitleVal] = useState(title);
  const titleRef = useRef<HTMLTextAreaElement | null>(null);

  // stage menu
  const [stageOpen, setStageOpen] = useState(false);
  const [localStage, setLocalStage] = useState<Stage>(stage);
  const stageWrap = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (stageWrap.current && !stageWrap.current.contains(e.target as Node)) setStageOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(reactionPrompt({ id, title: titleVal }));
    } catch {
      /* ignore */
    }
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1600);
    showToast("Reaction-prep prompt copied");
  }

  function toggleArchive() {
    startTransition(async () => {
      if (archived) {
        await restoreYoutubeIdea(id);
        showToast("Concept restored");
      } else {
        await archiveYoutubeIdea(id);
        showToast("Concept archived");
        router.push("/ideas?dataset=youtube");
      }
    });
  }

  function commitTitle() {
    setEditingTitle(false);
    const next = titleVal.trim();
    if (!next || next === title) {
      setTitleVal(title);
      return;
    }
    startTransition(async () => {
      const r = await updateYoutubeTitle(id, next);
      if (r?.title) setTitleVal(r.title);
      showToast("Title saved");
    });
  }

  function pickStage(s: Stage) {
    setStageOpen(false);
    if (s === localStage) return;
    setLocalStage(s);
    startTransition(async () => {
      await updateYoutubeStage(id, s);
      showToast(`Moved to ${STAGE_LABEL[s]}`);
    });
  }

  const shownStage: Stage = archived ? "archived" : localStage;

  return (
    <header className="ytd2-head">
      <div className="ytd2-meta">
        <div className="stage-pick" ref={stageWrap}>
          <button
            className={`yt-stage yt-stage--${shownStage} stage-pick__btn`}
            onClick={() => !archived && setStageOpen((v) => !v)}
            disabled={archived}
            aria-haspopup="listbox"
            aria-expanded={stageOpen}
          >
            <span className="yt-stage__dot" /> {STAGE_LABEL[shownStage]}
            {!archived && (
              <svg className="stage-pick__chev" width="9" height="9" viewBox="0 0 10 10" fill="none">
                <path d="M2 4 L5 7 L8 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
          {stageOpen && (
            <ul className="stage-menu" role="listbox">
              {STAGE_ORDER.map((s) => (
                <li key={s}>
                  <button
                    className={"stage-menu__item" + (s === localStage ? " is-current" : "")}
                    onClick={() => pickStage(s)}
                    role="option"
                    aria-selected={s === localStage}
                  >
                    <span className={`stage-menu__dot stage-menu__dot--${s}`} />
                    {STAGE_LABEL[s]}
                    {s === localStage && (
                      <svg className="stage-menu__check" width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M2.5 6 L5 8.5 L9.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {createdLabel && (
          <>
            <span className="sep" />
            <span>Added {createdLabel}</span>
          </>
        )}
        {filmedLabel && (
          <>
            <span className="sep" />
            <span>Filmed {filmedLabel}</span>
          </>
        )}
        <span className="sep" />
        <span className="ytd2-id">#{id.replace(/-/g, "").slice(0, 8)}</span>
      </div>

      {editingTitle ? (
        <TextareaAutosize
          ref={titleRef}
          className="ytd2-title ytd2-title--edit"
          value={titleVal}
          autoFocus
          onChange={(e) => setTitleVal(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitTitle();
            }
            if (e.key === "Escape") {
              setTitleVal(title);
              setEditingTitle(false);
            }
          }}
        />
      ) : (
        <h1
          className="ytd2-title"
          tabIndex={0}
          onClick={() => setEditingTitle(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") setEditingTitle(true);
          }}
          title="Click to rename"
        >
          {titleVal}
        </h1>
      )}

      {description && <p className="ytd2-desc">{description}</p>}

      <div className="ytd2-actions">
        <button className={"ytd-prep" + (copied ? " ytd-prep--copied" : "")} onClick={copyPrompt}>
          {copied ? (
            <>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M3 7 L6 10 L11 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>Prompt copied</span>
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M3.5 1.5 H9 L12 4.5 V12.5 H3.5 Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                <path d="M5.5 6.4 L7 7.9 L9.6 4.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>Copy reaction-prep prompt</span>
            </>
          )}
        </button>
        <button className="ytd-archive" onClick={toggleArchive}>
          {archived ? (
            <>
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                <path d="M3 7 A4 4 0 1 0 5 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="none" />
                <path d="M3 2 V4 H5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>Restore</span>
            </>
          ) : (
            <>
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                <rect x="2" y="3" width="10" height="2" rx="0.6" stroke="currentColor" strokeWidth="1.3" />
                <path d="M3 5 V11 H11 V5" stroke="currentColor" strokeWidth="1.3" />
                <path d="M5.5 7.5 H8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              <span>Archive</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
}

/* ── Properties: secondary metadata, collapsible ─────────────────────── */

function Properties({ format, hypothesis, result, verdict, lesson, sources }: DetailProps) {
  const rows: { k: string; v: string; mono?: boolean }[] = [];
  if (format) rows.push({ k: "Format", v: format });
  if (hypothesis) rows.push({ k: "Hypothesis", v: hypothesis });
  if (result) rows.push({ k: "Result", v: result, mono: true });
  if (verdict) rows.push({ k: "Verdict", v: verdict });
  if (lesson) rows.push({ k: "Lesson", v: lesson });

  const has = rows.length > 0 || sources.length > 0;
  const [open, setOpen] = useState(true);
  if (!has) return null;

  return (
    <section className={"props" + (open ? " props--open" : "")}>
      <button className="props__toggle" onClick={() => setOpen((v) => !v)}>
        <svg className="props__chev" width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M3.5 2 L6.5 5 L3.5 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Details
        <span className="props__count">{rows.length + (sources.length ? 1 : 0)}</span>
      </button>
      {open && (
        <div className="props__grid">
          {rows.map((r) => (
            <div className="prop" key={r.k}>
              <div className="prop__k">{r.k}</div>
              <div className={"prop__v" + (r.mono ? " prop__v--mono" : "")}>{r.v}</div>
            </div>
          ))}
          {sources.length > 0 && (
            <div className="prop prop--sources">
              <div className="prop__k">Sources</div>
              <ul className="prop__sources">
                {sources.map((u) => {
                  let host = u;
                  try {
                    host = new URL(u).hostname.replace(/^www\./, "");
                  } catch {
                    /* keep raw */
                  }
                  return (
                    <li key={u}>
                      <a href={u} target="_blank" rel="noopener noreferrer">
                        <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                          <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.1" />
                          <path d="M1.5 6 H10.5 M6 1.5 C8 4 8 8 6 10.5 C4 8 4 4 6 1.5" stroke="currentColor" strokeWidth="1.1" />
                        </svg>
                        {host}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/* ── Notes: the hero. Rendered markdown by default, live editor on click ─ */

type SaveStatus = "idle" | "dirty" | "saving" | "saved";

function NotesDoc({
  id,
  initialNotes,
  showToast,
}: {
  id: string;
  initialNotes: string;
  showToast: (t: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialNotes);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [mobileView, setMobileView] = useState<"write" | "preview">("write");

  const savedRef = useRef(initialNotes);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedFlash = useRef<ReturnType<typeof setTimeout> | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  const stats = readingStats(value);

  const doSave = useCallback(
    async (text: string, announce = false) => {
      if (text === savedRef.current) {
        setStatus("idle");
        return;
      }
      setStatus("saving");
      await updateYoutubeNotes(id, text);
      savedRef.current = text;
      setStatus("saved");
      if (announce) showToast("Notes saved");
      if (savedFlash.current) clearTimeout(savedFlash.current);
      savedFlash.current = setTimeout(() => setStatus((s) => (s === "saved" ? "idle" : s)), 2200);
    },
    [id, showToast],
  );

  useEffect(
    () => () => {
      if (debounce.current) clearTimeout(debounce.current);
      if (savedFlash.current) clearTimeout(savedFlash.current);
    },
    [],
  );

  function onChange(next: string) {
    setValue(next);
    setStatus("dirty");
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => doSave(next), 900);
  }

  function enterEdit() {
    setEditing(true);
    requestAnimationFrame(() => {
      const ta = taRef.current;
      if (ta) {
        ta.focus();
        const len = ta.value.length;
        ta.setSelectionRange(len, len);
      }
    });
  }

  function exitEdit() {
    if (debounce.current) clearTimeout(debounce.current);
    doSave(value, true);
    setEditing(false);
  }

  const empty = value.trim() === "";

  return (
    <section className={"notes" + (editing ? " notes--editing" : "")}>
      <div className="notes__bar">
        <div className="notes__eyebrow">
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path d="M3 2 H8.5 L11 4.5 V12 H3 Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
            <path d="M5 6 H9 M5 8.5 H9 M5 4 H7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          Notes
          {!empty && (
            <span className="notes__stats">
              {stats.words.toLocaleString()} words · {stats.mins} min read
            </span>
          )}
        </div>

        <div className="notes__tools">
          {editing && (
            <span className={`savechip savechip--${status}`}>
              {status === "saving" ? (
                <>
                  <span className="savechip__spin" /> Saving
                </>
              ) : status === "saved" ? (
                <>
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                    <path d="M2.5 6 L5 8.5 L9.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Saved
                </>
              ) : status === "dirty" ? (
                <>
                  <span className="savechip__dot" /> Unsaved
                </>
              ) : (
                "Up to date"
              )}
            </span>
          )}

          {editing && (
            <div className="seg-toggle" data-mobile-only>
              <button
                className={mobileView === "write" ? "is-on" : ""}
                onClick={() => setMobileView("write")}
              >
                Write
              </button>
              <button
                className={mobileView === "preview" ? "is-on" : ""}
                onClick={() => setMobileView("preview")}
              >
                Preview
              </button>
            </div>
          )}

          {editing ? (
            <button className="notes__btn notes__btn--done" onClick={exitEdit}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2.5 6 L5 8.5 L9.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Done
            </button>
          ) : (
            <button className="notes__btn" onClick={enterEdit}>
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                <path d="M9.5 2 L12 4.5 L5 11.5 L2 12 L2.5 9 Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
              </svg>
              Edit
            </button>
          )}
        </div>
      </div>

      {editing ? (
        <div className="notes__split" data-view={mobileView}>
          <div className="notes__pane notes__pane--write">
            <TextareaAutosize
              ref={taRef}
              className="notes__ta"
              value={value}
              minRows={16}
              spellCheck
              placeholder="Start writing in markdown — # heading, - bullet, **bold**, [text](url)…"
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  exitEdit();
                }
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  exitEdit();
                }
              }}
            />
          </div>
          <div className="notes__pane notes__pane--preview">
            <div className="notes__pane-label">Preview</div>
            {empty ? <p className="notes__empty">Nothing to preview yet.</p> : <Markdown text={value} />}
          </div>
        </div>
      ) : (
        <div
          className="notes__read"
          role="button"
          tabIndex={0}
          onClick={enterEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter") enterEdit();
          }}
        >
          {empty ? (
            <p className="notes__placeholder">No notes yet. Click to start writing in markdown.</p>
          ) : (
            <Markdown text={value} />
          )}
        </div>
      )}
    </section>
  );
}
