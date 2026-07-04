"use client";

import { useState, useRef, useEffect, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import TextareaAutosize from "react-textarea-autosize";
import { archiveVideoIdea, restoreVideoIdea, updateVideoIdeaTranscript } from "@/app/actions";
import { videoIdeaPrompt } from "@/app/ideas/IdeasClient";
import { Markdown } from "@/components/Markdown";

type Status = "fresh" | "recorded" | "archived";

const STATUS_LABEL: Record<Status, string> = {
  fresh: "Fresh",
  recorded: "Recorded",
  archived: "Archived",
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

type SaveStatus = "idle" | "dirty" | "saving" | "saved";

export function IdeaDetailClient({
  id,
  initialTranscript,
  status,
  scriptId,
  createdAt,
}: {
  id: string;
  initialTranscript: string;
  status: Status;
  scriptId: string | null;
  createdAt: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Transcript state lives here so Copy prompt always copies the live text.
  const [value, setValue] = useState(initialTranscript);

  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1900);
  }, []);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(videoIdeaPrompt({ id, transcript: value }));
    } catch {
      // ignore
    }
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1600);
    showToast("Idea copied — paste into Claude Code");
  }

  function onArchive() {
    startTransition(async () => {
      await archiveVideoIdea(id);
      router.refresh();
      showToast("Idea archived");
    });
  }

  function onRestore() {
    startTransition(async () => {
      await restoreVideoIdea(id);
      router.refresh();
      showToast("Idea restored");
    });
  }

  const date = formatDate(createdAt);

  return (
    <div className="ytd2">
      <header className="ytd2-head">
        <div className="ytd2-meta">
          <span className={`yt-stage yt-stage--${status}`}>
            <span className="yt-stage__dot" /> {STATUS_LABEL[status]}
          </span>
          <span className="sep" />
          <span>
            {date.label} · {date.time}
          </span>
          <span className="sep" />
          <span className="ytd2-id">
            <span className="hash">#</span>
            {shortId(id)}
          </span>
          {scriptId && (
            <>
              <span className="sep" />
              <Link href={`/${scriptId}`} className="slip__script-link">
                <svg viewBox="0 0 12 12" fill="none">
                  <path d="M3 2 H8 L10 4 V10 H3 Z" stroke="currentColor" strokeWidth="1.2" />
                </svg>
                scr_{scriptId.replace(/-/g, "").slice(0, 4)}
              </Link>
            </>
          )}
        </div>

        <div className="ytd2-actions">
          <button
            className={"ytd-prep" + (copied ? " ytd-prep--copied" : "")}
            onClick={copyPrompt}
            title="Copy idea for Claude Code"
          >
            {copied ? (
              <>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2.5 6 L5 8.5 L9.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Copied
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <rect x="3" y="3" width="7" height="7" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M2 8 V2.2 C2 2 2 2 2.2 2 H7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
                Copy prompt
              </>
            )}
          </button>
          {status === "archived" ? (
            <button className="ytd-archive" onClick={onRestore} disabled={pending}>
              Restore
            </button>
          ) : (
            <button className="ytd-archive" onClick={onArchive} disabled={pending}>
              Archive
            </button>
          )}
        </div>
      </header>

      <IdeaNote id={id} value={value} setValue={setValue} showToast={showToast} />

      <div className={"toast" + (toast ? " show" : "")}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M2.5 7 L5.5 10 L11.5 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>{toast ?? ""}</span>
      </div>
    </div>
  );
}

/* ── The note: the whole screen. Rendered by default, tap to edit,
      autosaves while typing, flushes on blur/Done/unmount. ──────────── */

function IdeaNote({
  id,
  value,
  setValue,
  showToast,
}: {
  id: string;
  value: string;
  setValue: (v: string) => void;
  showToast: (t: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [mobileView, setMobileView] = useState<"write" | "preview">("write");

  const savedRef = useRef(value);
  const valueRef = useRef(value);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedFlash = useRef<ReturnType<typeof setTimeout> | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const words = (value.trim().match(/\S+/g) ?? []).length;

  const doSave = useCallback(
    async (text: string, announce = false) => {
      if (text === savedRef.current) {
        setStatus("idle");
        return;
      }
      setStatus("saving");
      await updateVideoIdeaTranscript(id, text);
      savedRef.current = text;
      setStatus("saved");
      if (announce) showToast("Idea saved");
      if (savedFlash.current) clearTimeout(savedFlash.current);
      savedFlash.current = setTimeout(() => setStatus((s) => (s === "saved" ? "idle" : s)), 2200);
    },
    [id, showToast],
  );

  // Flush any unsaved text if the screen unmounts mid-debounce (back nav).
  useEffect(
    () => () => {
      if (debounce.current) clearTimeout(debounce.current);
      if (savedFlash.current) clearTimeout(savedFlash.current);
      if (valueRef.current !== savedRef.current) {
        void updateVideoIdeaTranscript(id, valueRef.current);
      }
    },
    [id],
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
          Idea note
          {!empty && <span className="notes__stats">{words.toLocaleString()} words</span>}
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
              className="notes__ta notes__ta--idea"
              value={value}
              minRows={12}
              spellCheck
              placeholder="Write the idea — plain text is fine; use - for bullets, # for headings…"
              onChange={(e) => onChange(e.target.value)}
              onBlur={() => {
                if (debounce.current) clearTimeout(debounce.current);
                doSave(valueRef.current);
              }}
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
          className="notes__read notes__read--idea"
          role="button"
          tabIndex={0}
          onClick={enterEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter") enterEdit();
          }}
        >
          {empty ? (
            <p className="notes__placeholder">Nothing here yet. Tap to start writing.</p>
          ) : (
            <Markdown text={value} />
          )}
        </div>
      )}
    </section>
  );
}
