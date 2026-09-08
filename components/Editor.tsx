"use client";

import { useState, useTransition, useMemo, useEffect, useCallback, useRef } from "react";
import TextareaAutosize from "react-textarea-autosize";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { updateScript, updateScriptStatus } from "@/app/actions";
import SuggestionDrawer from "./SuggestionDrawer";
import { FeedbackDock, FeedbackTrigger } from "./FeedbackDock";
import { AssetsOverlay, AssetsTrigger } from "./AssetsOverlay";
import ContextRail from "./ContextRail";
import type { FeedbackItem } from "./FeedbackDock";
import ScriptLines, { type LineData, type LineStats } from "./ScriptLines";

/* ── Types ── */

interface Intro {
    id: string;
    titleHook: string;
    verbalIntro: string;
    isNew?: boolean;
}

interface ContextItem {
    id: string;
    content: string;
    isNew?: boolean;
}

interface ScriptImage {
    id: string;
    imageUrl: string;
    prompt: string | null;
    createdAt: Date;
}

interface ScriptData {
    id: string;
    title: string;
    lines: LineData[];
    status: "draft" | "filmed" | "done" | "archived";
    editStatus: "idle" | "needs_ai_edit" | "ai_editing";
    editClaimedAt: Date | null;
    intros: Intro[];
    contextItems?: ContextItem[];
    scriptImages?: ScriptImage[];
    feedback?: FeedbackItem[];
}

/* ── Inline SVG icons ── */

const ArrowIcon = () => (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 18l-6-6 6-6" />
    </svg>
);
const ChevIcon = () => (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 9l6 6 6-6" />
    </svg>
);
const CheckIcon = () => (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 6L9 17l-5-5" />
    </svg>
);
const CopyIcon = () => (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" />
        <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
);
const PlusIcon = () => (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 5v14M5 12h14" />
    </svg>
);
const TrashIcon = () => (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </svg>
);
const SparkIcon = () => (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" />
    </svg>
);
/* ── Status colors ── */
/** Idle time before a title/intro edit is written back (#4110). */
const AUTOSAVE_DELAY_MS = 900;

const STATUS_COLORS: Record<string, string> = {
    draft: "#c69a3b",
    filmed: "#5b7a4a",
    done: "#3f6b8a",
    archived: "var(--ink-3)",
};

/* ── Editor component ── */

export default function Editor({ initialData }: { initialData: ScriptData }) {
    const [data, setData] = useState<ScriptData>(initialData);
    const [isPending, startTransition] = useTransition();
    const [statusOpen, setStatusOpen] = useState(false);
    const searchParams = useSearchParams();
    const assetsOpen = searchParams.get("assets") === "1";
    const setAssetsOpen = (open: boolean) => {
        const url = new URL(window.location.href);
        if (open) url.searchParams.set("assets", "1");
        else url.searchParams.delete("assets");
        // Keep the gallery open across browser downloads / phone tab restores.
        // Native history updates Next's search params without refreshing data.
        window.history.replaceState(null, "", url);
    };
    const [feedbackOpen, setFeedbackOpen] = useState(false);
    const [contextOpen, setContextOpen] = useState(false);
    const [idCopied, setIdCopied] = useState(false);
    const [metadataSaveState, setMetadataSaveState] = useState<"idle" | "dirty" | "saving" | "saved" | "error">("idle");
    const metadataVersionRef = useRef(0);
    const saveResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [activeSuggestion, setActiveSuggestion] = useState<{ introId: string | null; type: "hook" | "intro" | null; text: string }>({ introId: null, type: null, text: "" });
    const router = useRouter();

    // Title + intros used to save ONLY on an explicit tap or Cmd-S (#4110).
    // Dirty text lived in React state until then, so when mobile Safari froze or
    // evicted the backgrounded tab the edit vanished without ever having been
    // sent — no request, therefore no error, therefore silence. These refs back
    // a debounced autosave plus a flush when the page is going away.
    const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const dataRef = useRef(data);
    const dirtyRef = useRef(false);
    useEffect(() => { dataRef.current = data; }, [data]);

    const markMetadataDirty = useCallback(() => {
        metadataVersionRef.current += 1;
        if (saveResetRef.current) clearTimeout(saveResetRef.current);
        dirtyRef.current = true;
        setMetadataSaveState("dirty");
    }, []);

    // Live stats reported up from the line editor (decision #118: line-by-line body).
    const initialStats = useMemo<LineStats>(() => {
        const ls = initialData.lines;
        return {
            lines: ls.length,
            cues: ls.filter((l) => l.onScreen.trim().length > 0).length,
            words: ls.reduce((a, l) => a + l.say.split(/\s+/).filter(Boolean).length, 0),
            bodyText: "",
        };
    }, [initialData.lines]);
    const [lineStats, setLineStats] = useState<LineStats>(initialStats);
    const handleStats = useCallback((s: LineStats) => setLineStats(s), []);

    const wordCount = useMemo(() => {
        const introText = [data.title, ...data.intros.map((i) => i.titleHook + " " + i.verbalIntro)].join(" ");
        const introWords = introText.split(/\s+/).filter(Boolean).length;
        return introWords + lineStats.words;
    }, [data.title, data.intros, lineStats.words]);

    const onScreenCount = lineStats.cues;
    const openFeedbackCount = (data.feedback || []).filter((f) => !f.addressedAt).length;

    const runSave = useCallback((options: { silent?: boolean } = {}) => {
        const savingVersion = metadataVersionRef.current;
        if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
        if (saveResetRef.current) clearTimeout(saveResetRef.current);
        const snapshot = dataRef.current;
        dirtyRef.current = false;
        setMetadataSaveState("saving");
        startTransition(async () => {
            try {
                // Body is no longer sent — lines auto-save themselves (decision #118).
                await updateScript(snapshot.id, {
                    title: snapshot.title,
                    intros: snapshot.intros,
                    contextItems: snapshot.contextItems || [],
                });
                setData((prev) => ({
                    ...prev,
                    intros: prev.intros.map((intro) => intro.isNew ? { ...intro, isNew: false } : intro),
                }));
                if (metadataVersionRef.current === savingVersion) {
                    setMetadataSaveState("saved");
                    saveResetRef.current = setTimeout(() => setMetadataSaveState("idle"), 1800);
                } else {
                    // Edited again mid-flight; the debounce will pick the newer text up.
                    dirtyRef.current = true;
                    setMetadataSaveState("dirty");
                }
                if (!options.silent) toast.success("Saved");
                router.refresh();
            } catch {
                // The edit is still in state and still dirty, so a later autosave
                // or an explicit retry can pick it up.
                dirtyRef.current = true;
                setMetadataSaveState("error");
                toast.error("Couldn't save — your changes are still here. Tap Retry save.");
            }
        });
    }, [router]);

    const handleSave = useCallback(() => runSave(), [runSave]);

    // Leaving a field writes immediately rather than waiting out the debounce —
    // on mobile a blur is usually the keyboard closing, which often precedes an
    // app switch.
    const handleFieldBlur = useCallback(() => {
        if (dirtyRef.current) runSave({ silent: true });
    }, [runSave]);

    // Debounced autosave. Any edit to the title, a hook, an intro or a context
    // item schedules a write, so nothing depends on remembering to tap Save.
    useEffect(() => {
        if (metadataSaveState !== "dirty") return;
        if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = setTimeout(() => runSave({ silent: true }), AUTOSAVE_DELAY_MS);
        return () => {
            if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
        };
    }, [metadataSaveState, data, runSave]);

    // Last-gasp flush. Once the tab is hidden a server action in flight can be
    // dropped, so pending text goes out over a keepalive fetch instead — the
    // browser is obliged to finish that even while tearing the page down.
    useEffect(() => {
        const flush = () => {
            if (!dirtyRef.current) return;
            const snapshot = dataRef.current;
            dirtyRef.current = false;
            if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
            try {
                void fetch(`/api/scripts/${snapshot.id}/metadata`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        title: snapshot.title,
                        intros: snapshot.intros,
                        contextItems: snapshot.contextItems || [],
                    }),
                    keepalive: true,
                }).catch(() => { dirtyRef.current = true; });
            } catch {
                dirtyRef.current = true;
            }
        };
        const onVisibility = () => { if (document.visibilityState === "hidden") flush(); };
        // beforeunload does not fire reliably on iOS; pagehide does.
        document.addEventListener("visibilitychange", onVisibility);
        window.addEventListener("pagehide", flush);
        return () => {
            document.removeEventListener("visibilitychange", onVisibility);
            window.removeEventListener("pagehide", flush);
        };
    }, []);

    // ⌘S to save
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "s") {
                e.preventDefault();
                handleSave();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [handleSave]);

    const handleCopy = () => {
        const text = [
            ...data.intros.map((i) => i.verbalIntro).filter(Boolean),
            lineStats.bodyText,
        ].filter(Boolean).join("\n\n");
        navigator.clipboard.writeText(text);
        toast.success("Copied to clipboard");
    };

    // Copy the raw script UUID (needed to target skills/diagnostics at this
    // script). Lives in the always-visible title block so it stays reachable on
    // mobile, where the header icon buttons collapse (#2009).
    const handleCopyId = () => {
        navigator.clipboard.writeText(data.id);
        setIdCopied(true);
        setTimeout(() => setIdCopied(false), 1600);
        toast.success("Script ID copied");
    };

    const handleStatus = (newStatus: string) => {
        setData({ ...data, status: newStatus as ScriptData["status"] });
        setStatusOpen(false);
        startTransition(async () => {
            await updateScriptStatus(data.id, newStatus as "draft" | "filmed" | "done" | "archived");
            toast.success("Status updated");
        });
    };

    const addIntro = () => {
        const id = crypto.randomUUID();
        markMetadataDirty();
        setData((prev) => ({
            ...prev,
            intros: [...prev.intros, { id, titleHook: "", verbalIntro: "", isNew: true }],
        }));
        setTimeout(() => {
            const field = document.getElementById(`intro-hook-${id}`) as HTMLTextAreaElement | null;
            field?.focus({ preventScroll: true });
            field?.scrollIntoView({ block: "center" });
        }, 40);
    };

    const updateIntro = (id: string, field: "titleHook" | "verbalIntro", value: string) => {
        markMetadataDirty();
        setData((prev) => ({
            ...prev,
            intros: prev.intros.map((i) => (i.id === id ? { ...i, [field]: value } : i)),
        }));
    };

    const removeIntro = (id: string) => {
        markMetadataDirty();
        setData((prev) => ({ ...prev, intros: prev.intros.filter((i) => i.id !== id) }));
    };

    const openSuggestion = (intro: Intro, type: "hook" | "intro") => {
        if (intro.isNew) { toast.error("Save the script first."); return; }
        setActiveSuggestion({ introId: intro.id, type, text: type === "hook" ? intro.titleHook : intro.verbalIntro });
    };

    const statuses = ["draft", "filmed", "done", "archived"];
    const saveLabel = metadataSaveState === "saving"
        ? "Saving…"
        : metadataSaveState === "saved"
            ? "Saved"
            : metadataSaveState === "error"
                ? "Retry save"
                : metadataSaveState === "dirty"
                    ? "Save changes"
                    : "Save draft";

    useEffect(() => () => {
        if (saveResetRef.current) clearTimeout(saveResetRef.current);
        if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    }, []);

    return (
        <div className="cw-shell">
            {/* ── Header ── */}
            <header className="cw-header">
                <div className="cw-header-row">
                    {/* Left: back */}
                    <Link
                        href="/"
                        className="cw-back"
                        aria-label="Back to library"
                        onClick={(event) => {
                            if (metadataSaveState === "dirty" && !window.confirm("Discard unsaved title or intro changes?")) {
                                event.preventDefault();
                            }
                        }}
                    >
                        <ArrowIcon />
                        <span>Library</span>
                    </Link>

                    {/* Center: meta */}
                    <div className="cw-header-meta">
                        <span className="cw-meta-pair">
                            <span className="cw-meta-k">Words</span>
                            <span className="cw-meta-v">{wordCount.toLocaleString()}</span>
                        </span>
                        <span className="cw-meta-dot" />
                        <span className="cw-meta-pair">
                            <span className="cw-meta-k">Cues</span>
                            <span className="cw-meta-v">{onScreenCount}</span>
                        </span>
                    </div>

                    {/* Right: actions */}
                    <div className="cw-header-actions">
                        <AssetsTrigger
                            onClick={() => setAssetsOpen(true)}
                            count={initialData.scriptImages?.length ?? 0}
                        />

                        <button
                            className="cw-iconbtn cw-iconbtn--context"
                            onClick={() => setContextOpen((o) => !o)}
                            title="Toggle context"
                            style={{ opacity: contextOpen ? 1 : 0.5 }}
                        >
                            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/>
                            </svg>
                        </button>

                        <span className="cw-vrule" />

                        {/* Status dropdown */}
                        <div className="cw-status-wrap">
                            <button
                                className="cw-status"
                                aria-label={`Status: ${data.status}`}
                                onClick={() => setStatusOpen((o) => !o)}
                                onBlur={() => setTimeout(() => setStatusOpen(false), 120)}
                            >
                                <span className="cw-status-dot" style={{ background: STATUS_COLORS[data.status] ?? "var(--ink-3)" }} />
                                <span style={{ textTransform: "capitalize" }}>{data.status}</span>
                                <ChevIcon />
                            </button>
                            {statusOpen && (
                                <div className="cw-status-menu">
                                    {statuses.map((s) => (
                                        <button
                                            key={s}
                                            className="cw-status-item"
                                            onMouseDown={() => handleStatus(s)}
                                        >
                                            <span className="cw-status-dot" style={{ background: STATUS_COLORS[s] }} />
                                            <span style={{ textTransform: "capitalize" }}>{s}</span>
                                            {s === data.status && <span className="cw-status-check"><CheckIcon /></span>}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <span className="cw-vrule" />

                        <button className="cw-iconbtn" title="Copy script" onClick={handleCopy}>
                            <CopyIcon />
                        </button>

                        <button
                            className="cw-save"
                            onClick={handleSave}
                            disabled={isPending || metadataSaveState === "saving"}
                        >
                            <span aria-live="polite">{saveLabel}</span>
                            <kbd className="cw-kbd">⌘S</kbd>
                        </button>
                    </div>
                </div>
            </header>

            {/* ── Stage ── */}
            <div className="cw-stage">
                <main className="cw-doc">
                    {/* A failed save has to stay on screen — a toast that fades is
                        how hooks went missing unnoticed (#4110). */}
                    {metadataSaveState === "error" && (
                        <div className="cw-savealert" role="alert">
                            <span className="cw-savealert__dot" aria-hidden="true" />
                            <span className="cw-savealert__text">
                                Your last change didn&rsquo;t save. It&rsquo;s still here on this screen — retry before you leave.
                            </span>
                            <button type="button" className="cw-savealert__btn" onClick={handleSave}>
                                Retry save
                            </button>
                        </div>
                    )}

                    {/* Title block */}
                    <section className="cw-titleblock">
                        <div className="cw-titleblock-meta">
                            <span className="cw-eyebrow">Script</span>
                            <span className="cw-eyebrow-dot" />
                            <span className="cw-eyebrow" style={{ textTransform: "capitalize" }}>{data.status}</span>
                            <button
                                type="button"
                                className={"cw-idbtn" + (idCopied ? " cw-idbtn--ok" : "")}
                                title={`Copy script ID (${data.id})`}
                                onClick={handleCopyId}
                            >
                                {idCopied ? (
                                    <span>Copied ✓</span>
                                ) : (
                                    <>
                                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                                            <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
                                            <path d="M3 10.5 H2.5 A1 1 0 0 1 1.5 9.5 V2.5 A1 1 0 0 1 2.5 1.5 H9.5 A1 1 0 0 1 10.5 2.5 V3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                                        </svg>
                                        <span className="cw-idbtn__label">Copy ID</span>
                                        <span className="cw-idbtn__num">{data.id.slice(0, 8)}</span>
                                    </>
                                )}
                            </button>
                        </div>
                        <TextareaAutosize
                            className="cw-title"
                            value={data.title}
                            onChange={(e) => {
                                markMetadataDirty();
                                setData({ ...data, title: e.target.value });
                            }}
                            onBlur={handleFieldBlur}
                            placeholder="Untitled script"
                            autoCapitalize="sentences"
                            autoCorrect="on"
                        />
                        <div className="cw-titleblock-rule">
                            <span className="cw-titleblock-byline">Reel Scripter</span>
                        </div>
                    </section>

                    {/* Intros section */}
                    <section className="cw-section">
                        <div className="cw-section-head">
                            <h2 className="cw-section-title">
                                <span className="cw-section-numeral">I.</span>
                                Intros &amp; Hooks
                            </h2>
                            <span className="cw-section-rule" />
                            <span className="cw-section-count">{data.intros.length} take{data.intros.length === 1 ? "" : "s"}</span>
                            <button type="button" className="cw-section-add" onClick={addIntro}>
                                <PlusIcon /><span>Add take</span>
                            </button>
                        </div>

                        <div className="cw-intros">
                            {data.intros.map((intro, index) => (
                                <article key={intro.id} className="cw-intro">
                                    <div className="cw-intro-gutter">
                                        <span className="cw-take-num">Take {String(index + 1).padStart(2, "0")}</span>
                                        <span className="cw-take-line" />
                                        <button
                                            className="cw-take-action"
                                            onClick={() => removeIntro(intro.id)}
                                            title="Remove take"
                                        >
                                            <TrashIcon />
                                        </button>
                                    </div>
                                    <div className="cw-intro-body">
                                        <div className="cw-intro-row">
                                            <span className="cw-intro-label">Hook</span>
                                            <TextareaAutosize
                                                id={`intro-hook-${intro.id}`}
                                                className="cw-intro-hook"
                                                value={intro.titleHook}
                                                onChange={(e) => updateIntro(intro.id, "titleHook", e.target.value)}
                                                onBlur={handleFieldBlur}
                                                placeholder="A line that stops the scroll…"
                                                autoCapitalize="sentences"
                                                autoCorrect="on"
                                                enterKeyHint="next"
                                                onKeyDown={(event) => {
                                                    if (event.key === "Enter" && !event.shiftKey) {
                                                        event.preventDefault();
                                                        document.getElementById(`intro-spoken-${intro.id}`)?.focus();
                                                    }
                                                }}
                                            />
                                            <button
                                                className="cw-intro-ai"
                                                onClick={() => openSuggestion(intro, "hook")}
                                                title="Suggest variations"
                                            >
                                                <SparkIcon /><span>Suggest</span>
                                            </button>
                                        </div>
                                        <div className="cw-intro-row">
                                            <span className="cw-intro-label">Spoken</span>
                                            <TextareaAutosize
                                                id={`intro-spoken-${intro.id}`}
                                                className="cw-intro-verbal"
                                                value={intro.verbalIntro}
                                                onChange={(e) => updateIntro(intro.id, "verbalIntro", e.target.value)}
                                                onBlur={handleFieldBlur}
                                                placeholder="What you actually say to camera…"
                                                autoCapitalize="sentences"
                                                autoCorrect="on"
                                            />
                                        </div>
                                    </div>
                                </article>
                            ))}
                            {data.intros.length === 0 && (
                                <div className="cw-empty">
                                    No takes yet.{" "}
                                    <button className="cw-link" onClick={addIntro}>Write the first one</button>.
                                </div>
                            )}
                        </div>
                        {data.intros.length > 0 && (
                            <button type="button" className="cw-section-add cw-section-add--bottom" onClick={addIntro}>
                                <PlusIcon /><span>Add another hook + intro</span>
                            </button>
                        )}
                    </section>

                    {/* Script lines (decision #118: line-by-line body) */}
                    <section className="cw-section">
                        <div className="cw-section-head">
                            <h2 className="cw-section-title">
                                <span className="cw-section-numeral">II.</span>
                                Script
                            </h2>
                            <span className="cw-section-rule" />
                            <span className="cw-section-count">
                                {lineStats.lines} line{lineStats.lines === 1 ? "" : "s"} · {onScreenCount} cue{onScreenCount === 1 ? "" : "s"}
                            </span>
                        </div>

                        <ScriptLines
                            scriptId={data.id}
                            initialLines={data.lines}
                            onStats={handleStats}
                        />
                    </section>

                    {/* Doc footer */}
                    <footer className="cw-doc-foot">
                        <span className="cw-foot-rule" />
                        <span className="cw-foot-mark">— end —</span>
                        <span className="cw-foot-rule" />
                    </footer>
                </main>

                {/* Context rail */}
                {contextOpen && <ContextRail contextItems={data.contextItems || []} />}
            </div>

            {/* Feedback dock */}
            {feedbackOpen ? (
                <FeedbackDock
                    scriptId={data.id}
                    feedback={data.feedback || []}
                    onClose={() => setFeedbackOpen(false)}
                />
            ) : (
                <FeedbackTrigger
                    onClick={() => setFeedbackOpen(true)}
                    openCount={openFeedbackCount}
                />
            )}

            {/* Assets overlay */}
            {assetsOpen && (
                <AssetsOverlay
                    scriptId={data.id}
                    images={initialData.scriptImages || []}
                    onClose={() => setAssetsOpen(false)}
                />
            )}

            {/* Suggestion drawer */}
            <SuggestionDrawer
                isOpen={!!activeSuggestion.introId}
                introId={activeSuggestion.introId}
                type={activeSuggestion.type}
                currentText={activeSuggestion.text}
                onClose={() => setActiveSuggestion({ introId: null, type: null, text: "" })}
            />
        </div>
    );
}
