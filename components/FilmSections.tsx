"use client";

import { useState, useCallback, useTransition, useRef, useEffect } from "react";
import TextareaAutosize from "react-textarea-autosize";
import { fmtClock } from "@/lib/utils";
import {
    addFilmSection,
    updateFilmSectionField,
    updateFilmSectionSeconds,
    setFilmSectionFilmed,
    moveFilmSection,
    deleteFilmSection,
} from "@/app/actions";

/* ── Types ── */

export interface SectionData {
    id: string;
    position: number;
    label: string;
    intent: string;
    plannedBeats: string;
    targetSeconds: number | null;
    onScreen: string;
    say: string;
    retentionDevice: string;
    filmed: boolean;
    filmedNote: string;
    filmedAt: string | null;
}

type TextField = "label" | "intent" | "plannedBeats" | "onScreen" | "say" | "retentionDevice" | "filmedNote";
const DB_FIELD: Record<TextField, "label" | "intent" | "planned_beats" | "on_screen" | "say" | "retention_device" | "filmed_note"> = {
    label: "label",
    intent: "intent",
    plannedBeats: "planned_beats",
    onScreen: "on_screen",
    say: "say",
    retentionDevice: "retention_device",
    filmedNote: "filmed_note",
};


/* ── Icons ── */

const PlusIcon = () => (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 5v14M5 12h14" />
    </svg>
);
const TrashIcon = () => (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </svg>
);
const UpIcon = () => (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
);
const DownIcon = () => (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 5v14M19 12l-7 7-7-7" />
    </svg>
);
const CheckIcon = ({ size = 12 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
        <path d="M2.5 7 L5.5 10 L11.5 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);
const ChevronIcon = () => (
    <svg width={12} height={12} viewBox="0 0 10 10" fill="none">
        <path d="M3 2 L7 5 L3 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

/* ── Section card ── */

interface SectionCardProps {
    section: SectionData;
    index: number;
    count: number;
    startSeconds: number;
    open: boolean;
    onToggleOpen: (id: string) => void;
    onField: (id: string, field: TextField, value: string) => void;
    onSaveField: (id: string, field: TextField, value: string) => void;
    onSeconds: (id: string, value: string) => void;
    onSaveSeconds: (id: string, value: string) => void;
    onFilmed: (id: string, filmed: boolean) => void;
    onMove: (id: string, dir: "up" | "down") => void;
    onAddBelow: (id: string) => void;
    onRemove: (id: string) => void;
}

function SectionCard({
    section: s, index, count, startSeconds, open,
    onToggleOpen, onField, onSaveField, onSeconds, onSaveSeconds,
    onFilmed, onMove, onAddBelow, onRemove,
}: SectionCardProps) {
    const num = String(index + 1).padStart(2, "0");
    return (
        <article className={"fs-card" + (s.filmed ? " fs-card--filmed" : "") + (open ? " fs-card--open" : "")}>
            <div className="fs-card__head">
                <button
                    className="fs-card__opener"
                    onClick={() => onToggleOpen(s.id)}
                    aria-expanded={open}
                    aria-label={`Section ${index + 1}: ${s.label || "Untitled"}`}
                >
                    <span className="fs-card__num">{num}</span>
                    <span className="fs-card__headmain">
                        <span className={"fs-card__label" + (s.label.trim() ? "" : " fs-card__label--empty")}>
                            {s.label.trim() || "Untitled section"}
                        </span>
                        <span className="fs-card__headmeta">
                            <span className="fs-card__clock">
                                {s.targetSeconds != null ? fmtClock(s.targetSeconds) : "—:——"}
                            </span>
                            <span className="fs-card__at">@ {fmtClock(startSeconds)}</span>
                            {s.filmed && (
                                <span className="fs-card__filmedtag">
                                    <CheckIcon size={9} /> filmed
                                </span>
                            )}
                        </span>
                    </span>
                    <span className="fs-card__chev"><ChevronIcon /></span>
                </button>
                <button
                    className={"fs-filmbtn" + (s.filmed ? " fs-filmbtn--on" : "")}
                    onClick={() => onFilmed(s.id, !s.filmed)}
                    title={s.filmed ? "Mark unfilmed" : "Mark filmed"}
                    aria-pressed={s.filmed}
                >
                    <CheckIcon />
                </button>
            </div>

            {open && (
                <div className="fs-card__body">
                    <div className="fs-field fs-field--label">
                        <span className="fs-field__k">Section</span>
                        <TextareaAutosize
                            className="fs-ta fs-ta--label"
                            value={s.label}
                            onChange={(e) => onField(s.id, "label", e.target.value)}
                            onBlur={(e) => onSaveField(s.id, "label", e.target.value)}
                            placeholder="Section label…"
                            minRows={1}
                        />
                    </div>

                    <div className="fs-field">
                        <span className="fs-field__k">Say</span>
                        <TextareaAutosize
                            className="fs-ta fs-ta--say"
                            value={s.say}
                            onChange={(e) => onField(s.id, "say", e.target.value)}
                            onBlur={(e) => onSaveField(s.id, "say", e.target.value)}
                            placeholder="Scripted lines or improv pointers…"
                            minRows={1}
                        />
                    </div>

                    <div className="fs-field">
                        <span className="fs-field__k">On screen</span>
                        <TextareaAutosize
                            className="fs-ta fs-ta--onscreen"
                            value={s.onScreen}
                            onChange={(e) => onField(s.id, "onScreen", e.target.value)}
                            onBlur={(e) => onSaveField(s.id, "onScreen", e.target.value)}
                            placeholder="Visuals, graphics, screen recordings…"
                            minRows={1}
                        />
                    </div>

                    <div className="fs-field">
                        <span className="fs-field__k">Beats</span>
                        <TextareaAutosize
                            className="fs-ta"
                            value={s.plannedBeats}
                            onChange={(e) => onField(s.id, "plannedBeats", e.target.value)}
                            onBlur={(e) => onSaveField(s.id, "plannedBeats", e.target.value)}
                            placeholder="The beats this section walks through…"
                            minRows={1}
                        />
                    </div>

                    <div className="fs-field">
                        <span className="fs-field__k">Intent</span>
                        <TextareaAutosize
                            className="fs-ta fs-ta--muted"
                            value={s.intent}
                            onChange={(e) => onField(s.id, "intent", e.target.value)}
                            onBlur={(e) => onSaveField(s.id, "intent", e.target.value)}
                            placeholder="What this section is for…"
                            minRows={1}
                        />
                    </div>

                    <div className="fs-field">
                        <span className="fs-field__k">Retention</span>
                        <TextareaAutosize
                            className="fs-ta fs-ta--muted"
                            value={s.retentionDevice}
                            onChange={(e) => onField(s.id, "retentionDevice", e.target.value)}
                            onBlur={(e) => onSaveField(s.id, "retentionDevice", e.target.value)}
                            placeholder="Open loops, payoffs — why the viewer keeps watching…"
                            minRows={1}
                        />
                    </div>

                    <div className="fs-field">
                        <span className="fs-field__k">Target</span>
                        <span className="fs-seconds">
                            <input
                                className="fs-seconds__input"
                                type="number"
                                inputMode="numeric"
                                min={0}
                                value={s.targetSeconds ?? ""}
                                onChange={(e) => onSeconds(s.id, e.target.value)}
                                onBlur={(e) => onSaveSeconds(s.id, e.target.value)}
                                placeholder="—"
                            />
                            <span className="fs-seconds__unit">sec</span>
                            {s.targetSeconds != null && s.targetSeconds >= 60 && (
                                <span className="fs-seconds__clock">= {fmtClock(s.targetSeconds)}</span>
                            )}
                        </span>
                    </div>

                    {(s.filmed || s.filmedNote.trim() !== "") && (
                        <div className="fs-field">
                            <span className="fs-field__k">Filmed note</span>
                            <TextareaAutosize
                                className="fs-ta fs-ta--muted"
                                value={s.filmedNote}
                                onChange={(e) => onField(s.id, "filmedNote", e.target.value)}
                                onBlur={(e) => onSaveField(s.id, "filmedNote", e.target.value)}
                                placeholder="How the take went, what changed on the day…"
                                minRows={1}
                            />
                        </div>
                    )}

                    <div className="fs-card__controls">
                        <button className="fs-ctl" onClick={() => onMove(s.id, "up")} disabled={index === 0}>
                            <UpIcon /> <span>Up</span>
                        </button>
                        <button className="fs-ctl" onClick={() => onMove(s.id, "down")} disabled={index === count - 1}>
                            <DownIcon /> <span>Down</span>
                        </button>
                        <button className="fs-ctl" onClick={() => onAddBelow(s.id)}>
                            <PlusIcon /> <span>Add below</span>
                        </button>
                        <span className="fs-card__controls-spacer" />
                        <button className="fs-ctl fs-ctl--danger" onClick={() => onRemove(s.id)}>
                            <TrashIcon /> <span>Delete</span>
                        </button>
                    </div>
                </div>
            )}
        </article>
    );
}

/* ── Container ── */

export default function FilmSections({
    ideaId,
    initialSections,
}: {
    ideaId: string;
    initialSections: SectionData[];
}) {
    const [sections, setSections] = useState<SectionData[]>(initialSections);
    const [openIds, setOpenIds] = useState<Set<string>>(new Set());
    const [toast, setToast] = useState<string | null>(null);
    const [, start] = useTransition();
    // Last value persisted per field, so blur only writes when something changed.
    const savedRef = useRef<Record<string, string>>({});
    const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => () => {
        if (toastTimer.current) clearTimeout(toastTimer.current);
    }, []);

    const showToast = useCallback((text: string) => {
        setToast(text);
        if (toastTimer.current) clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(null), 1800);
    }, []);

    const totalSeconds = sections.reduce((acc, s) => acc + (s.targetSeconds ?? 0), 0);
    const timedCount = sections.filter((s) => s.targetSeconds != null).length;
    const filmedCount = sections.filter((s) => s.filmed).length;
    const allOpen = sections.length > 0 && sections.every((s) => openIds.has(s.id));

    // Cumulative start time per section, for pacing.
    const starts: number[] = [];
    let acc = 0;
    for (const s of sections) {
        starts.push(acc);
        acc += s.targetSeconds ?? 0;
    }

    const toggleOpen = useCallback((id: string) => {
        setOpenIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const toggleAll = useCallback(() => {
        setOpenIds(allOpen ? new Set() : new Set(sections.map((s) => s.id)));
    }, [allOpen, sections]);

    const editField = useCallback((id: string, field: TextField, value: string) => {
        setSections((prev) => prev.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
    }, []);

    const saveField = useCallback((id: string, field: TextField, value: string) => {
        const key = `${id}:${field}`;
        if (savedRef.current[key] === value) return;
        savedRef.current[key] = value;
        start(async () => {
            const res = await updateFilmSectionField(id, ideaId, DB_FIELD[field], value);
            if (res?.error) showToast(res.error);
        });
    }, [ideaId, showToast]);

    const editSeconds = useCallback((id: string, raw: string) => {
        const n = raw === "" ? null : parseInt(raw, 10);
        setSections((prev) =>
            prev.map((s) => (s.id === id ? { ...s, targetSeconds: n != null && Number.isFinite(n) ? Math.max(0, n) : null } : s))
        );
    }, []);

    const saveSeconds = useCallback((id: string, raw: string) => {
        const key = `${id}:seconds`;
        if (savedRef.current[key] === raw) return;
        savedRef.current[key] = raw;
        const n = raw === "" ? null : parseInt(raw, 10);
        start(async () => {
            await updateFilmSectionSeconds(id, ideaId, n != null && Number.isFinite(n) ? n : null);
        });
    }, [ideaId]);

    const setFilmed = useCallback((id: string, filmed: boolean) => {
        setSections((prev) =>
            prev.map((s) =>
                s.id === id ? { ...s, filmed, filmedAt: filmed ? new Date().toISOString() : null } : s
            )
        );
        start(async () => {
            await setFilmSectionFilmed(id, ideaId, filmed);
        });
        showToast(filmed ? "Marked filmed" : "Marked unfilmed");
    }, [ideaId, showToast]);

    const move = useCallback((id: string, dir: "up" | "down") => {
        setSections((prev) => {
            const idx = prev.findIndex((s) => s.id === id);
            const j = dir === "up" ? idx - 1 : idx + 1;
            if (idx === -1 || j < 0 || j >= prev.length) return prev;
            const copy = [...prev];
            [copy[idx], copy[j]] = [copy[j], copy[idx]];
            return copy;
        });
        start(async () => {
            const res = await moveFilmSection(id, ideaId, dir);
            if (!res?.success) showToast("Couldn't reorder");
        });
    }, [ideaId, showToast]);

    const add = useCallback((afterId?: string) => {
        start(async () => {
            const res = await addFilmSection(ideaId, afterId ?? null);
            if (!res?.success || !res.section) {
                showToast("Couldn't add section");
                return;
            }
            const r = res.section;
            const ns: SectionData = {
                id: r.id,
                position: r.position,
                label: r.label ?? "",
                intent: r.intent ?? "",
                plannedBeats: r.planned_beats ?? "",
                targetSeconds: r.target_seconds,
                onScreen: r.on_screen ?? "",
                say: r.say ?? "",
                retentionDevice: r.retention_device ?? "",
                filmed: r.status === "filmed",
                filmedNote: r.filmed_note ?? "",
                filmedAt: r.filmed_at,
            };
            setSections((prev) => {
                if (!afterId) return [...prev, ns];
                const idx = prev.findIndex((s) => s.id === afterId);
                if (idx === -1) return [...prev, ns];
                const copy = [...prev];
                copy.splice(idx + 1, 0, ns);
                return copy;
            });
            setOpenIds((prev) => new Set(prev).add(ns.id));
        });
    }, [ideaId, showToast]);

    const remove = useCallback((id: string) => {
        if (!confirm("Delete this section?")) return;
        start(async () => {
            await deleteFilmSection(id, ideaId);
            setSections((prev) => prev.filter((s) => s.id !== id));
            showToast("Section deleted");
        });
    }, [ideaId, showToast]);

    return (
        <div className="fs">
            <div className="fs-summary">
                <div className="fs-summary__stats">
                    <span className="fs-summary__stat">
                        <span className="fs-summary__v">{sections.length}</span>
                        <span className="fs-summary__k">section{sections.length === 1 ? "" : "s"}</span>
                    </span>
                    <span className="fs-summary__sep" />
                    <span className="fs-summary__stat">
                        <span className="fs-summary__v">{fmtClock(totalSeconds)}</span>
                        <span className="fs-summary__k">
                            est. runtime{timedCount < sections.length ? ` · ${sections.length - timedCount} untimed` : ""}
                        </span>
                    </span>
                    <span className="fs-summary__sep" />
                    <span className="fs-summary__stat">
                        <span className="fs-summary__v">{filmedCount}/{sections.length}</span>
                        <span className="fs-summary__k">filmed</span>
                    </span>
                </div>
                <div className="fs-summary__tools">
                    {sections.length > 0 && (
                        <button className="fs-summary__toggleall" onClick={toggleAll}>
                            {allOpen ? "Collapse all" : "Expand all"}
                        </button>
                    )}
                </div>
                {sections.length > 0 && (
                    <div
                        className="fs-progress"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={sections.length}
                        aria-valuenow={filmedCount}
                        aria-label="Sections filmed"
                    >
                        <span className="fs-progress__bar" style={{ width: `${(filmedCount / sections.length) * 100}%` }} />
                    </div>
                )}
            </div>

            {sections.length === 0 ? (
                <div className="fs-empty">
                    <p className="fs-empty__title">No script yet.</p>
                    <p className="fs-empty__sub">
                        This concept hasn&rsquo;t been broken into film sections. Add the first one —
                        or let the planning session write them for you.
                    </p>
                    <button className="fs-add fs-add--primary" onClick={() => add()}>
                        <PlusIcon /><span>Add first section</span>
                    </button>
                </div>
            ) : (
                <>
                    <div className="fs-cards">
                        {sections.map((s, i) => (
                            <SectionCard
                                key={s.id}
                                section={s}
                                index={i}
                                count={sections.length}
                                startSeconds={starts[i]}
                                open={openIds.has(s.id)}
                                onToggleOpen={toggleOpen}
                                onField={editField}
                                onSaveField={saveField}
                                onSeconds={editSeconds}
                                onSaveSeconds={saveSeconds}
                                onFilmed={setFilmed}
                                onMove={move}
                                onAddBelow={(id) => add(id)}
                                onRemove={remove}
                            />
                        ))}
                    </div>
                    <button className="fs-add" onClick={() => add()}>
                        <PlusIcon /><span>Add section</span>
                    </button>
                </>
            )}

            <div className={"toast" + (toast ? " show" : "")}>
                <CheckIcon size={14} />
                <span>{toast ?? ""}</span>
            </div>
        </div>
    );
}
