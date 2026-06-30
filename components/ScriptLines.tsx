"use client";

import { useState, useCallback, useTransition, useEffect, useRef, memo } from "react";
import TextareaAutosize from "react-textarea-autosize";
import { toast } from "sonner";
import {
    addScriptLine,
    updateScriptLine,
    deleteScriptLine,
    addLineNote,
    updateLineNote,
    setLineNoteAddressed,
    deleteLineNote,
} from "@/app/actions";

/* ── Types ── */

export interface LineNote {
    id: string;
    author: "human" | "ai";
    content: string;
    addressedAt: string | null;
    createdAt: string;
}

export interface LineData {
    id: string;
    position: number;
    say: string;
    onScreen: string;
    rationale: string;
    notes: LineNote[];
}

type EditableField = "say" | "onScreen" | "rationale";
const DB_FIELD: Record<EditableField, "say" | "on_screen" | "rationale"> = {
    say: "say",
    onScreen: "on_screen",
    rationale: "rationale",
};

/* ── Helpers ── */

function relativeTime(date: string): string {
    const diff = Date.now() - new Date(date).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}

/* ── Icons ── */

const PlusIcon = () => (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 5v14M5 12h14" />
    </svg>
);
const TrashIcon = () => (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </svg>
);
const NoteIcon = () => (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
);

/* ── Note row ── */

function NoteCard({
    note,
    scriptId,
    onChange,
    onRemove,
}: {
    note: LineNote;
    scriptId: string;
    onChange: (next: LineNote) => void;
    onRemove: () => void;
}) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(note.content);
    const [, start] = useTransition();

    const isAi = note.author === "ai";
    const unaddressed = !note.addressedAt;

    const saveEdit = () => {
        const next = draft.trim();
        if (!next || next === note.content) { setEditing(false); return; }
        start(async () => {
            const res = await updateLineNote(note.id, scriptId, next);
            if (res?.error) { toast.error(res.error); return; }
            onChange({ ...note, content: next });
            setEditing(false);
        });
    };

    const toggleAddressed = () => {
        const next = !note.addressedAt;
        start(async () => {
            await setLineNoteAddressed(note.id, scriptId, next);
            onChange({ ...note, addressedAt: next ? new Date().toISOString() : null });
        });
    };

    const remove = () => {
        start(async () => {
            await deleteLineNote(note.id, scriptId);
            onRemove();
        });
    };

    return (
        <div className={"cw-note cw-note--" + note.author + (note.addressedAt ? " cw-note--done" : "")}>
            <div className="cw-note__head">
                <span className={"cw-note__author cw-note__author--" + note.author}>
                    {isAi ? "AI" : "You"}
                </span>
                {isAi && unaddressed && <span className="cw-note__rec">cut / rewrite</span>}
                <span className="cw-note__spacer" />
                <span className="cw-note__time">{relativeTime(note.createdAt)}</span>
            </div>

            {editing ? (
                <div className="cw-note__edit">
                    <TextareaAutosize
                        className="cw-note__editta"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        autoFocus
                        minRows={2}
                    />
                    <div className="cw-note__editactions">
                        <button className="cw-note__btn" onClick={() => { setDraft(note.content); setEditing(false); }}>Cancel</button>
                        <button className="cw-note__btn cw-note__btn--accent" onClick={saveEdit} disabled={!draft.trim()}>Save</button>
                    </div>
                </div>
            ) : (
                <p className="cw-note__body">{note.content}</p>
            )}

            {!editing && (
                <div className="cw-note__foot">
                    <button className={"cw-note__action" + (note.addressedAt ? " is-on" : "")} onClick={toggleAddressed}>
                        {note.addressedAt ? "Addressed ✓" : "Mark addressed"}
                    </button>
                    <button className="cw-note__action" onClick={() => { setDraft(note.content); setEditing(true); }}>Edit</button>
                    <button className="cw-note__action cw-note__action--danger" onClick={remove}>Delete</button>
                </div>
            )}
        </div>
    );
}

/* ── Line row ── */

interface LineRowProps {
    line: LineData;
    index: number;
    scriptId: string;
    onField: (lineId: string, field: EditableField, value: string) => void;
    onSaveField: (lineId: string, field: EditableField, value: string) => void;
    onAddBelow: (lineId: string) => void;
    onRemove: (lineId: string) => void;
    onNotesChange: (lineId: string, notes: LineNote[]) => void;
}

const LineRow = memo(function LineRow({
    line, index, scriptId, onField, onSaveField, onAddBelow, onRemove, onNotesChange,
}: LineRowProps) {
    const unaddressedAi = line.notes.filter((n) => n.author === "ai" && !n.addressedAt).length;
    // Surface AI cut-recommendations by default: a line carrying one opens its thread.
    const [open, setOpen] = useState(unaddressedAi > 0);
    const [draft, setDraft] = useState("");
    const [, start] = useTransition();

    const submitNote = () => {
        const content = draft.trim();
        if (!content) return;
        start(async () => {
            const res = await addLineNote(line.id, scriptId, "human", content);
            if (res?.error) { toast.error(res.error); return; }
            const n = res!.note as { id: string; content: string; addressed_at: string | null; created_at: string };
            onNotesChange(line.id, [
                ...line.notes,
                { id: n.id, author: "human", content: n.content, addressedAt: n.addressed_at, createdAt: String(n.created_at) },
            ]);
            setDraft("");
        });
    };

    const changeNote = (next: LineNote) =>
        onNotesChange(line.id, line.notes.map((n) => (n.id === next.id ? next : n)));
    const removeNote = (id: string) =>
        onNotesChange(line.id, line.notes.filter((n) => n.id !== id));

    const noteCount = line.notes.length;

    return (
        <article className={"cw-line" + (unaddressedAi > 0 ? " cw-line--flagged" : "")}>
            <div className="cw-line__gutter">
                <span className="cw-line__num">{String(index + 1).padStart(2, "0")}</span>
                <span className="cw-line__rail" />
            </div>

            <div className="cw-line__main">
                <TextareaAutosize
                    id={`say-${line.id}`}
                    className="cw-line__say"
                    value={line.say}
                    onChange={(e) => onField(line.id, "say", e.target.value)}
                    onBlur={(e) => onSaveField(line.id, "say", e.target.value)}
                    placeholder="What you say to camera…"
                    minRows={1}
                />

                <div className="cw-line__sub">
                    <div className="cw-line__field">
                        <span className="cw-line__flabel">On screen</span>
                        <TextareaAutosize
                            className="cw-line__onscreen"
                            value={line.onScreen}
                            onChange={(e) => onField(line.id, "onScreen", e.target.value)}
                            onBlur={(e) => onSaveField(line.id, "onScreen", e.target.value)}
                            placeholder="On-screen text or graphic cue…"
                            minRows={1}
                        />
                    </div>
                    <div className="cw-line__field">
                        <span className="cw-line__flabel">Why</span>
                        <TextareaAutosize
                            className="cw-line__rationale"
                            value={line.rationale}
                            onChange={(e) => onField(line.id, "rationale", e.target.value)}
                            onBlur={(e) => onSaveField(line.id, "rationale", e.target.value)}
                            placeholder="Rationale — why this line earns its place…"
                            minRows={1}
                        />
                    </div>
                </div>

                <div className="cw-line__notesbar">
                    <button className={"cw-line__notetoggle" + (open ? " is-open" : "")} onClick={() => setOpen((o) => !o)}>
                        <NoteIcon />
                        <span>{noteCount > 0 ? `${noteCount} note${noteCount === 1 ? "" : "s"}` : "Add note"}</span>
                        {unaddressedAi > 0 && <span className="cw-line__aiflag">{unaddressedAi} AI</span>}
                    </button>
                </div>

                {open && (
                    <div className="cw-line__notes">
                        {line.notes.map((note) => (
                            <NoteCard
                                key={note.id}
                                note={note}
                                scriptId={scriptId}
                                onChange={changeNote}
                                onRemove={() => removeNote(note.id)}
                            />
                        ))}
                        <div className="cw-line__compose">
                            <TextareaAutosize
                                className="cw-line__composeta"
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                placeholder="Leave a note on this line…"
                                minRows={2}
                                onKeyDown={(e) => {
                                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); submitNote(); }
                                }}
                            />
                            <div className="cw-line__composeactions">
                                <span className="cw-line__composehint"><kbd>⌘</kbd><kbd>↵</kbd></span>
                                <button className="cw-note__btn cw-note__btn--accent" onClick={submitNote} disabled={!draft.trim()}>
                                    Add note
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="cw-line__actions">
                <button className="cw-line__act" title="Add line below" onClick={() => onAddBelow(line.id)}>
                    <PlusIcon />
                </button>
                <button className="cw-line__act cw-line__act--danger" title="Delete line" onClick={() => onRemove(line.id)}>
                    <TrashIcon />
                </button>
            </div>
        </article>
    );
});

/* ── Lines container ── */

export interface LineStats { lines: number; cues: number; words: number; bodyText: string }

// Assemble the lines into a plain-text script for the "Copy script" button:
// each say line, with its on-screen cue as a bracket directive beneath it.
function buildBodyText(lines: LineData[]): string {
    return lines
        .map((l) => {
            const parts: string[] = [];
            if (l.say.trim()) parts.push(l.say.trim());
            if (l.onScreen.trim()) parts.push(`[ON SCREEN: ${l.onScreen.trim()}]`);
            return parts.join("\n");
        })
        .filter(Boolean)
        .join("\n\n");
}

export default function ScriptLines({
    scriptId,
    initialLines,
    onStats,
}: {
    scriptId: string;
    initialLines: LineData[];
    onStats?: (s: LineStats) => void;
}) {
    const [lines, setLines] = useState<LineData[]>(initialLines);
    const [, start] = useTransition();
    // Last value persisted per field, so blur only writes when something changed.
    const savedRef = useRef<Record<string, string>>({});

    useEffect(() => {
        for (const l of initialLines) {
            const k = l.id;
            if (!(`${k}:say` in savedRef.current)) savedRef.current[`${k}:say`] = l.say;
            if (!(`${k}:onScreen` in savedRef.current)) savedRef.current[`${k}:onScreen`] = l.onScreen;
            if (!(`${k}:rationale` in savedRef.current)) savedRef.current[`${k}:rationale`] = l.rationale;
        }
    }, [initialLines]);

    useEffect(() => {
        if (!onStats) return;
        const words = lines.reduce((acc, l) => acc + l.say.split(/\s+/).filter(Boolean).length, 0);
        const cues = lines.filter((l) => l.onScreen.trim().length > 0).length;
        onStats({ lines: lines.length, cues, words, bodyText: buildBodyText(lines) });
    }, [lines, onStats]);

    const editField = useCallback((lineId: string, field: EditableField, value: string) => {
        setLines((prev) => prev.map((l) => (l.id === lineId ? { ...l, [field]: value } : l)));
    }, []);

    const saveField = useCallback((lineId: string, field: EditableField, value: string) => {
        const key = `${lineId}:${field}`;
        if (savedRef.current[key] === value) return;
        savedRef.current[key] = value;
        start(async () => {
            const res = await updateScriptLine(lineId, scriptId, DB_FIELD[field], value);
            if (res?.error) toast.error(res.error);
        });
    }, [scriptId]);

    const addLine = useCallback((afterLineId?: string) => {
        start(async () => {
            const res = await addScriptLine(scriptId, afterLineId ?? null);
            if (!res?.success || !res.line) { toast.error("Couldn't add line"); return; }
            const created = res.line;
            const nl: LineData = {
                id: created.id, position: created.position, say: "", onScreen: "", rationale: "", notes: [],
            };
            savedRef.current[`${nl.id}:say`] = "";
            savedRef.current[`${nl.id}:onScreen`] = "";
            savedRef.current[`${nl.id}:rationale`] = "";
            setLines((prev) => {
                if (!afterLineId) return [...prev, nl];
                const idx = prev.findIndex((l) => l.id === afterLineId);
                if (idx === -1) return [...prev, nl];
                const copy = [...prev];
                copy.splice(idx + 1, 0, nl);
                return copy;
            });
            setTimeout(() => document.getElementById(`say-${nl.id}`)?.focus(), 40);
        });
    }, [scriptId]);

    const removeLine = useCallback((lineId: string) => {
        if (!confirm("Delete this line and its notes?")) return;
        start(async () => {
            await deleteScriptLine(lineId, scriptId);
            setLines((prev) => prev.filter((l) => l.id !== lineId));
        });
    }, [scriptId]);

    const setLineNotes = useCallback((lineId: string, notes: LineNote[]) => {
        setLines((prev) => prev.map((l) => (l.id === lineId ? { ...l, notes } : l)));
    }, []);

    return (
        <div className="cw-lines">
            {lines.length === 0 ? (
                <div className="cw-lines-empty">
                    <p className="cw-lines-empty__title">No lines yet.</p>
                    <p className="cw-lines-empty__sub">
                        This script hasn&rsquo;t been broken into lines. Add the first one below — or it&rsquo;ll be
                        filled in when the body backfill runs.
                    </p>
                    <button className="cw-line-add cw-line-add--primary" onClick={() => addLine()}>
                        <PlusIcon /><span>Add line</span>
                    </button>
                </div>
            ) : (
                <>
                    {lines.map((line, i) => (
                        <LineRow
                            key={line.id}
                            line={line}
                            index={i}
                            scriptId={scriptId}
                            onField={editField}
                            onSaveField={saveField}
                            onAddBelow={addLine}
                            onRemove={removeLine}
                            onNotesChange={setLineNotes}
                        />
                    ))}
                    <button className="cw-line-add cw-line-add--end" onClick={() => addLine()}>
                        <PlusIcon /><span>Add line</span>
                    </button>
                </>
            )}
        </div>
    );
}
