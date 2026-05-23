"use client";

import { useState, useTransition, useMemo, useEffect, useCallback, useRef, type JSX } from "react";
import TextareaAutosize from "react-textarea-autosize";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateScript, updateScriptStatus } from "@/app/actions";
import SuggestionDrawer from "./SuggestionDrawer";
import { FeedbackDock, FeedbackTrigger } from "./FeedbackDock";
import { AssetsOverlay, AssetsTrigger } from "./AssetsOverlay";
import ContextRail from "./ContextRail";
import type { FeedbackItem } from "./FeedbackDock";

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
    body: string;
    status: "draft" | "filmed" | "done" | "archived";
    editStatus: "idle" | "needs_ai_edit" | "ai_editing";
    editClaimedAt: Date | null;
    intros: Intro[];
    contextItems?: ContextItem[];
    scriptImages?: ScriptImage[];
    feedback?: FeedbackItem[];
}

/* ── Body parsing ── */

// Any content wrapped in square brackets is treated as an on-screen/graphic cue.
// Format: [LABEL: content] or [content] — the label before the colon is displayed
// as the pill key (e.g. "ON SCREEN", "SCREEN RECORDING", "B-ROLL").
const DIRECTIVE_RE = /\[([^\]]+)\]/g;

function parseDirective(raw: string): { label: string; content: string } {
    const colonIdx = raw.indexOf(":");
    if (colonIdx > 0) {
        return { label: raw.slice(0, colonIdx).trim(), content: raw.slice(colonIdx + 1).trim() };
    }
    return { label: "On-screen", content: raw.trim() };
}

type Token = { type: "text"; text: string } | { type: "directive"; label: string; text: string };

function tokenizeParagraph(text: string): Token[] {
    const tokens: Token[] = [];
    const re = new RegExp(DIRECTIVE_RE.source, "g");
    let last = 0, m;
    while ((m = re.exec(text)) !== null) {
        if (m.index > last) tokens.push({ type: "text", text: text.slice(last, m.index) });
        const { label, content } = parseDirective(m[1]);
        tokens.push({ type: "directive", label, text: content });
        last = m.index + m[0].length;
    }
    if (last < text.length) tokens.push({ type: "text", text: text.slice(last) });
    return tokens;
}

type BodyBlock =
    | { kind: "directive"; label: string; text: string; key: number }
    | { kind: "para"; tokens: Token[]; key: number };

function parseBody(body: string): BodyBlock[] {
    const blocks: BodyBlock[] = [];
    const directiveRe = new RegExp(DIRECTIVE_RE.source, "g");
    let last = 0, key = 0, m;
    while ((m = directiveRe.exec(body)) !== null) {
        const before = body.slice(last, m.index);
        if (before.trim()) {
            for (const p of before.split(/\n{2,}/).map((s) => s.trimEnd()).filter(Boolean))
                blocks.push({ kind: "para", tokens: tokenizeParagraph(p), key: key++ });
        }
        const { label, content } = parseDirective(m[1]);
        blocks.push({ kind: "directive", label, text: content, key: key++ });
        last = m.index + m[0].length;
    }
    const after = body.slice(last);
    if (after.trim()) {
        for (const p of after.split(/\n{2,}/).map((s) => s.trimEnd()).filter(Boolean))
            blocks.push({ kind: "para", tokens: tokenizeParagraph(p), key: key++ });
    }
    return blocks;
}

function OnscreenPill({ label, text }: { label: string; text: string }) {
    const words = text.split(/\s+/);
    const preview = words.slice(0, 6).join(" ");
    const truncated = words.length > 6;
    return (
        <span className="cw-onscreen-pill" data-full={text}>
            <span className="cw-onscreen-pill__key">{label}</span>
            <span className="cw-onscreen-pill__text">{preview}{truncated ? "…" : ""}</span>
        </span>
    );
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
const PenIcon = () => (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
);

/* ── Status colors ── */
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
    const [bodyEditing, setBodyEditing] = useState(false);
    const [assetsOpen, setAssetsOpen] = useState(false);
    const [feedbackOpen, setFeedbackOpen] = useState(false);
    const [contextOpen, setContextOpen] = useState(false);
    const [activeSuggestion, setActiveSuggestion] = useState<{ introId: string | null; type: "hook" | "intro" | null; text: string }>({ introId: null, type: null, text: "" });
    const bodyTaRef = useRef<HTMLTextAreaElement>(null);
    const router = useRouter();

    const wordCount = useMemo(() => {
        const text = [data.title, ...data.intros.map((i) => i.titleHook + " " + i.verbalIntro), data.body].join(" ");
        return text.replace(/\[[^\]]*\]/g, "").split(/\s+/).filter(Boolean).length;
    }, [data]);

    const bodyBlocks = useMemo(() => parseBody(data.body), [data.body]);
    const onScreenCount = bodyBlocks.filter((b) => b.kind === "directive").length;
    const openFeedbackCount = (data.feedback || []).filter((f) => !f.addressedAt).length;

    useEffect(() => {
        if (bodyEditing) requestAnimationFrame(() => bodyTaRef.current?.focus());
    }, [bodyEditing]);

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
    }, [data]);

    const handleSave = () => {
        startTransition(async () => {
            try {
                await updateScript(data.id, {
                    title: data.title,
                    body: data.body,
                    intros: data.intros,
                    contextItems: data.contextItems || [],
                });
                toast.success("Saved");
                router.refresh();
            } catch {
                toast.error("Failed to save");
            }
        });
    };

    const handleCopy = () => {
        const text = [
            ...data.intros.map((i) => i.verbalIntro).filter(Boolean),
            data.body,
        ].filter(Boolean).join("\n\n");
        navigator.clipboard.writeText(text);
        toast.success("Copied to clipboard");
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
        setData((prev) => ({
            ...prev,
            intros: [...prev.intros, { id: crypto.randomUUID(), titleHook: "", verbalIntro: "", isNew: true }],
        }));
    };

    const updateIntro = (id: string, field: "titleHook" | "verbalIntro", value: string) => {
        setData((prev) => ({
            ...prev,
            intros: prev.intros.map((i) => (i.id === id ? { ...i, [field]: value } : i)),
        }));
    };

    const removeIntro = (id: string) => {
        setData((prev) => ({ ...prev, intros: prev.intros.filter((i) => i.id !== id) }));
    };

    const openSuggestion = (intro: Intro, type: "hook" | "intro") => {
        if (intro.isNew) { toast.error("Save the script first."); return; }
        setActiveSuggestion({ introId: intro.id, type, text: type === "hook" ? intro.titleHook : intro.verbalIntro });
    };

    const statuses = ["draft", "filmed", "done", "archived"];

    return (
        <div className="cw-shell">
            {/* ── Header ── */}
            <header className="cw-header">
                <div className="cw-header-row">
                    {/* Left: back */}
                    <Link href="/" className="cw-back" aria-label="Back to library">
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
                            count={data.scriptImages?.length ?? 0}
                        />

                        <button
                            className="cw-iconbtn"
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
                            disabled={isPending}
                        >
                            <span>{isPending ? "Saving…" : "Save draft"}</span>
                            <kbd className="cw-kbd">⌘S</kbd>
                        </button>
                    </div>
                </div>
            </header>

            {/* ── Stage ── */}
            <div className="cw-stage">
                <main className="cw-doc">
                    {/* Title block */}
                    <section className="cw-titleblock">
                        <div className="cw-titleblock-meta">
                            <span className="cw-eyebrow">Script</span>
                            <span className="cw-eyebrow-dot" />
                            <span className="cw-eyebrow" style={{ textTransform: "capitalize" }}>{data.status}</span>
                        </div>
                        <TextareaAutosize
                            className="cw-title"
                            value={data.title}
                            onChange={(e) => setData({ ...data, title: e.target.value })}
                            placeholder="Untitled script"
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
                            <button className="cw-section-add" onClick={addIntro}>
                                <PlusIcon /><span>New take</span>
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
                                                className="cw-intro-hook"
                                                value={intro.titleHook}
                                                onChange={(e) => updateIntro(intro.id, "titleHook", e.target.value)}
                                                placeholder="A line that stops the scroll…"
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
                                                className="cw-intro-verbal"
                                                value={intro.verbalIntro}
                                                onChange={(e) => updateIntro(intro.id, "verbalIntro", e.target.value)}
                                                placeholder="What you actually say to camera…"
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
                    </section>

                    {/* Body section */}
                    <section className="cw-section">
                        <div className="cw-section-head">
                            <h2 className="cw-section-title">
                                <span className="cw-section-numeral">II.</span>
                                Script
                            </h2>
                            <span className="cw-section-rule" />
                            <span className="cw-section-count">{onScreenCount} on-screen cue{onScreenCount === 1 ? "" : "s"}</span>
                            <button
                                className={"cw-section-add" + (bodyEditing ? " is-active" : "")}
                                onClick={() => setBodyEditing((e) => !e)}
                            >
                                <PenIcon /><span>{bodyEditing ? "Preview" : "Edit"}</span>
                            </button>
                        </div>

                        {bodyEditing ? (
                            <div className="cw-body-edit">
                                <TextareaAutosize
                                    className="cw-body-textarea"
                                    value={data.body}
                                    onChange={(e) => setData({ ...data, body: e.target.value })}
                                    onBlur={() => setBodyEditing(false)}
                                    placeholder="Begin the script…"
                                    minRows={14}
                                />
                                <p className="cw-edit-hint">
                                    Anything in brackets becomes a graphic cue — e.g.{" "}
                                    <span className="cw-pill cw-pill-mono">[ON SCREEN: your line]</span>{" "}
                                    or <span className="cw-pill cw-pill-mono">[SCREEN RECORDING: description]</span>.
                                    They appear in the margin in preview.
                                </p>
                            </div>
                        ) : (
                            <div className="cw-body" onClick={() => setBodyEditing(true)}>
                                {bodyBlocks.flatMap((block, bi) => {
                                    if (block.kind === "directive") {
                                        return [(
                                            <div key={`${bi}-d`} className="cw-block cw-block-directive">
                                                <OnscreenPill label={block.label} text={block.text} />
                                            </div>
                                        )];
                                    }
                                    // Split para tokens at directive boundaries so each pill gets its own row
                                    const rows: JSX.Element[] = [];
                                    let textBuf = "";
                                    let rowIdx = 0;
                                    for (const token of block.tokens) {
                                        if (token.type === "directive") {
                                            if (textBuf.trim()) {
                                                rows.push(<p key={`${bi}-t${rowIdx++}`} className="cw-block cw-block-para">{textBuf}</p>);
                                                textBuf = "";
                                            }
                                            rows.push(
                                                <div key={`${bi}-d${rowIdx++}`} className="cw-block cw-block-directive">
                                                    <OnscreenPill label={token.label} text={token.text} />
                                                </div>
                                            );
                                        } else {
                                            textBuf += token.text;
                                        }
                                    }
                                    if (textBuf.trim()) {
                                        rows.push(<p key={`${bi}-t${rowIdx++}`} className="cw-block cw-block-para">{textBuf}</p>);
                                    }
                                    return rows;
                                })}
                            </div>
                        )}
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
                    images={data.scriptImages || []}
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
