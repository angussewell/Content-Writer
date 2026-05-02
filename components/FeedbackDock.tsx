"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { saveFeedback, deleteFeedback } from "@/app/actions";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export interface FeedbackItem {
    id: string;
    content: string;
    roundNumber: number;
    createdAt: Date;
    addressedAt: Date | null;
}

function relativeTime(date: Date): string {
    const diff = Date.now() - new Date(date).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}

interface FeedbackDockProps {
    scriptId: string;
    feedback: FeedbackItem[];
    onClose: () => void;
}

export function FeedbackDock({ scriptId, feedback, onClose }: FeedbackDockProps) {
    const [draft, setDraft] = useState("");
    const [isPending, startTransition] = useTransition();
    const taRef = useRef<HTMLTextAreaElement>(null);
    const router = useRouter();

    useEffect(() => {
        taRef.current?.focus();
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleSubmit();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [draft]);

    const handleSubmit = () => {
        if (!draft.trim() || isPending) return;
        startTransition(async () => {
            const result = await saveFeedback(scriptId, draft.trim());
            if (result.error) {
                toast.error(result.error);
            } else {
                toast.success("Feedback sent");
                setDraft("");
                router.refresh();
            }
        });
    };

    const handleDelete = (id: string) => {
        startTransition(async () => {
            await deleteFeedback(id, scriptId);
            router.refresh();
        });
    };

    const openCount = feedback.filter(f => !f.addressedAt).length;

    return (
        <div className="fb-dock" role="dialog" aria-label="Feedback">
            <div className="fb-dock__head">
                <div className="fb-dock__title">
                    <span>Feedback</span>
                    {openCount > 0 && (
                        <span className="fb-dock__title-meta">
                            {openCount} open
                        </span>
                    )}
                </div>
                <button className="fb-dock__close" onClick={onClose} aria-label="Close">
                    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                </button>
            </div>

            <div className="fb-dock__scroll">
                <div className="fb-compose">
                    <textarea
                        ref={taRef}
                        className="fb-compose__textarea"
                        placeholder="What should change about this script?"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        spellCheck={false}
                    />
                    <div className="fb-compose__foot">
                        <span className="fb-compose__hint">
                            <kbd>⌘</kbd><kbd>↵</kbd>
                            <span>to send</span>
                        </span>
                        <button
                            className="fb-send"
                            onClick={handleSubmit}
                            disabled={!draft.trim() || isPending}
                        >
                            <span>{isPending ? "Sending…" : "Send"}</span>
                            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                                <path d="M5 12h14M13 6l6 6-6 6" />
                            </svg>
                        </button>
                    </div>
                </div>

                {feedback.length > 0 && (
                    <>
                        <div className="fb-history-label">History · {feedback.length} round{feedback.length === 1 ? "" : "s"}</div>
                        <div className="fb-history">
                            {[...feedback].reverse().map((item) => (
                                <article key={item.id} className="fb-round">
                                    <header className="fb-round__head">
                                        <span className="fb-round__num">Round {String(item.roundNumber).padStart(2, "0")}</span>
                                        <span className={`fb-round__status fb-round__status--${item.addressedAt ? "addressed" : "open"}`}>
                                            {item.addressedAt ? "addressed" : "open"}
                                        </span>
                                        <span className="fb-round__head-spacer" />
                                        <span className="fb-round__date">{relativeTime(item.createdAt)}</span>
                                        {!item.addressedAt && (
                                            <button
                                                onClick={() => handleDelete(item.id)}
                                                disabled={isPending}
                                                style={{ marginLeft: "0.5rem", opacity: 0.4, background: "none", border: "none", cursor: "pointer", color: "var(--ink-2)", lineHeight: 1 }}
                                                title="Delete"
                                            >
                                                <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M18 6L6 18M6 6l12 12" />
                                                </svg>
                                            </button>
                                        )}
                                    </header>
                                    <div className="fb-round__body">
                                        {item.content.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}
                                    </div>
                                </article>
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

interface FeedbackTriggerProps {
    onClick: () => void;
    openCount: number;
}

export function FeedbackTrigger({ onClick, openCount }: FeedbackTriggerProps) {
    return (
        <button className="fb-trigger" onClick={onClick}>
            <span className="fb-trigger__pulse" aria-hidden="true" />
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span>Feedback</span>
            {openCount > 0 && <span className="fb-trigger__count">{openCount}</span>}
        </button>
    );
}
