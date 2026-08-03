"use client";

import { useMemo, useState, useTransition } from "react";
import { ExternalLink, Eye, Pencil, Save, Search, Trash2, X } from "lucide-react";
import { deleteInspirationHook, updateInspirationHook } from "@/app/actions";

export type InspirationHook = {
  id: string;
  platform: string;
  source_post_id: string;
  source_url: string;
  creator_handle: string;
  first_sentence: string;
  second_sentence: string | null;
  on_screen_text: string | null;
  opening_visual: string;
  views: string | null;
  creator_followers: string | null;
  notes: string | null;
  saved_at: string;
  updated_at: string;
};

type Draft = {
  sourceUrl: string;
  creatorHandle: string;
  firstSentence: string;
  secondSentence: string;
  onScreenText: string;
  openingVisual: string;
  notes: string;
};

function toDraft(hook: InspirationHook): Draft {
  return {
    sourceUrl: hook.source_url,
    creatorHandle: hook.creator_handle,
    firstSentence: hook.first_sentence,
    secondSentence: hook.second_sentence ?? "",
    onScreenText: hook.on_screen_text ?? "",
    openingVisual: hook.opening_visual,
    notes: hook.notes ?? "",
  };
}

function compactNumber(value: string | null) {
  if (!value) return "—";
  const number = Number(value);
  if (!Number.isFinite(number)) return value;
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(number);
}

function dateLabel(value: string) {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function dateTimeLabel(value: string) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function InspirationLibrary({ initialHooks }: { initialHooks: InspirationHook[] }) {
  const [hooks, setHooks] = useState(initialHooks);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(initialHooks[0]?.id ?? null);
  const [draft, setDraft] = useState<Draft | null>(initialHooks[0] ? toDraft(initialHooks[0]) : null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selected = hooks.find((hook) => hook.id === selectedId) ?? null;
  const visibleHooks = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return hooks;
    return hooks.filter((hook) =>
      [hook.creator_handle, hook.first_sentence, hook.second_sentence, hook.on_screen_text, hook.opening_visual, hook.notes]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))
    );
  }, [hooks, query]);

  function flash(message: string) {
    setToast(message);
    window.setTimeout(() => setToast((current) => current === message ? null : current), 1800);
  }

  function choose(hook: InspirationHook) {
    if (dirty && selectedId !== hook.id && !window.confirm("Discard unsaved hook changes?")) return;
    setSelectedId(hook.id);
    setDraft(toDraft(hook));
    setDirty(false);
    setSheetOpen(true);
  }

  function change<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => current ? { ...current, [key]: value } : current);
    setDirty(true);
  }

  function saveHook() {
    if (!selected || !draft) return;
    startTransition(async () => {
      const result = await updateInspirationHook(selected.id, draft);
      if (!result.success) {
        flash(result.error);
        return;
      }
      setHooks((current) => current.map((hook) => hook.id === selected.id ? {
        ...hook,
        source_url: draft.sourceUrl.trim(),
        creator_handle: draft.creatorHandle.trim().replace(/^@/, ""),
        first_sentence: draft.firstSentence.trim(),
        second_sentence: draft.secondSentence.trim() || null,
        on_screen_text: draft.onScreenText.trim() || null,
        opening_visual: draft.openingVisual.trim(),
        notes: draft.notes.trim() || null,
        updated_at: result.updatedAt,
      } : hook));
      setDirty(false);
      flash("Hook saved");
    });
  }

  function removeHook() {
    if (!selected || !window.confirm(`Delete this hook from @${selected.creator_handle}? This cannot be undone.`)) return;
    startTransition(async () => {
      const result = await deleteInspirationHook(selected.id);
      if (!result.success) {
        flash(result.error);
        return;
      }
      const remaining = hooks.filter((hook) => hook.id !== selected.id);
      const next = remaining[0] ?? null;
      setHooks(remaining);
      setSelectedId(next?.id ?? null);
      setDraft(next ? toDraft(next) : null);
      setDirty(false);
      setSheetOpen(false);
      flash("Hook deleted");
    });
  }

  return (
    <>
      <div className="ih-toolbar">
        <label className="ih-search">
          <Search size={15} aria-hidden="true" />
          <span className="sr-only">Search hooks</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the shelf…" />
        </label>
        <p className="ih-count"><strong>{visibleHooks.length}</strong> of {hooks.length} saved hooks</p>
      </div>

      {hooks.length === 0 ? (
        <div className="empty ih-empty">
          <div className="empty__mark">❦</div>
          <p className="empty__txt">The shelf is empty. Saved inspiration will land here.</p>
        </div>
      ) : (
        <div className="ih-workspace">
          <section className="ih-list" aria-label="Saved inspiration hooks">
            {visibleHooks.map((hook) => (
              <article key={hook.id} className={"ih-card" + (hook.id === selectedId ? " ih-card--selected" : "")}>
                <div className="ih-card__meta">
                  <span className="ih-handle">@{hook.creator_handle}</span>
                  <span>{compactNumber(hook.views)} views</span>
                  <span>{compactNumber(hook.creator_followers)} followers</span>
                </div>
                <blockquote className="ih-card__first">“{hook.first_sentence}”</blockquote>
                {hook.second_sentence && <p className="ih-card__second">{hook.second_sentence}</p>}
                <div className="ih-card__artifacts">
                  {hook.on_screen_text && (
                    <div className="ih-artifact">
                      <span className="ih-artifact__label">On screen</span>
                      <span className="ih-artifact__text ih-artifact__text--title">{hook.on_screen_text}</span>
                    </div>
                  )}
                  <div className="ih-artifact">
                    <span className="ih-artifact__label"><Eye size={13} aria-hidden="true" /> Opening</span>
                    <span className="ih-artifact__text">{hook.opening_visual}</span>
                  </div>
                </div>
                <div className="ih-card__footer">
                  <span>Saved {dateLabel(hook.saved_at)}</span>
                  <a href={hook.source_url} target="_blank" rel="noreferrer" className="ih-source-link">
                    Source <ExternalLink size={13} aria-hidden="true" />
                  </a>
                  <button type="button" className="ih-edit-button" onClick={() => choose(hook)} aria-label={`Edit hook from @${hook.creator_handle}`}>
                    <Pencil size={14} aria-hidden="true" /> Edit
                  </button>
                </div>
              </article>
            ))}
            {visibleHooks.length === 0 && <p className="ih-no-results">Nothing on the shelf matches “{query}”.</p>}
          </section>

          <aside className={"ih-detail" + (sheetOpen ? " ih-detail--open" : "")} aria-label="Hook editor">
            {selected && draft ? (
              <>
                <div className="ih-detail__head">
                  <div>
                    <span className="ih-detail__eyebrow">Editing hook</span>
                    <h2>@{selected.creator_handle}</h2>
                  </div>
                  <button type="button" className="ih-close" onClick={() => setSheetOpen(false)} aria-label="Close hook editor">
                    <X size={18} aria-hidden="true" />
                  </button>
                </div>

                <div className="ih-editor">
                  <div className="ih-identity">
                    <span>{selected.platform}</span>
                    <span>{selected.source_post_id}</span>
                    <span>Saved {dateTimeLabel(selected.saved_at)}</span>
                    <span>Updated {dateTimeLabel(selected.updated_at)}</span>
                  </div>

                  <EditorField label="First spoken sentence" required>
                    <textarea rows={4} value={draft.firstSentence} onChange={(event) => change("firstSentence", event.target.value)} />
                  </EditorField>
                  <EditorField label="Second spoken sentence">
                    <textarea rows={3} value={draft.secondSentence} onChange={(event) => change("secondSentence", event.target.value)} placeholder="No second sentence captured" />
                  </EditorField>
                  <EditorField label="Exact on-screen text">
                    <textarea rows={2} value={draft.onScreenText} onChange={(event) => change("onScreenText", event.target.value)} placeholder="No title card captured" />
                  </EditorField>
                  <EditorField label="Opening visual" required>
                    <textarea rows={4} value={draft.openingVisual} onChange={(event) => change("openingVisual", event.target.value)} />
                  </EditorField>
                  <div className="ih-fieldgrid">
                    <EditorField label="Creator" required>
                      <input value={draft.creatorHandle} onChange={(event) => change("creatorHandle", event.target.value)} />
                    </EditorField>
                    <EditorField label="Source URL" required>
                      <input type="url" value={draft.sourceUrl} onChange={(event) => change("sourceUrl", event.target.value)} />
                    </EditorField>
                  </div>
                  <EditorField label="Your notes">
                    <textarea rows={5} value={draft.notes} onChange={(event) => change("notes", event.target.value)} placeholder="What makes this opening work? How could you adapt it?" />
                  </EditorField>
                </div>

                <div className="ih-detail__actions">
                  <button type="button" className="ih-delete" onClick={removeHook} disabled={pending}>
                    <Trash2 size={15} aria-hidden="true" /> Delete
                  </button>
                  <span className={"ih-save-state" + (dirty ? " ih-save-state--dirty" : "")}>{dirty ? "Unsaved changes" : "Up to date"}</span>
                  <button type="button" className="ih-save" onClick={saveHook} disabled={pending || !dirty}>
                    <Save size={15} aria-hidden="true" /> {pending ? "Saving…" : "Save changes"}
                  </button>
                </div>
              </>
            ) : (
              <div className="ih-detail__blank">
                <Pencil size={20} aria-hidden="true" />
                <p>Choose a hook to inspect and edit it.</p>
              </div>
            )}
          </aside>
        </div>
      )}

      {toast && <div className="m-toast" role="status">{toast}</div>}
    </>
  );
}

function EditorField({ label, required = false, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="ih-field">
      <span className="ih-field__label">{label}{required && <em>required</em>}</span>
      {children}
    </label>
  );
}
