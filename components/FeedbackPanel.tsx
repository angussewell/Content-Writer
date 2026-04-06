"use client";

import { useState, useTransition } from "react";
import { X, Send, AlertTriangle } from "lucide-react";
import { saveFeedback, forceReleaseEditClaim, deleteFeedback } from "@/app/actions";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export interface FeedbackItem {
    id: string;
    content: string;
    roundNumber: number;
    createdAt: Date;
    addressedAt: Date | null;
}

interface FeedbackPanelProps {
    scriptId: string;
    editStatus: "idle" | "needs_ai_edit" | "ai_editing";
    editClaimedAt: Date | null;
    feedback: FeedbackItem[];
}

function relativeTime(date: Date): string {
    const now = Date.now();
    const diff = now - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

export default function FeedbackPanel({ scriptId, editStatus, editClaimedAt, feedback }: FeedbackPanelProps) {
    const [content, setContent] = useState("");
    const [isPending, startTransition] = useTransition();
    const router = useRouter();

    const handleSubmit = () => {
        if (!content.trim()) return;
        startTransition(async () => {
            const result = await saveFeedback(scriptId, content);
            if (result.error) {
                toast.error(result.error);
            } else {
                toast.success("Feedback sent to AI editor");
                setContent("");
                router.refresh();
            }
        });
    };

    const handleDelete = (feedbackId: string) => {
        startTransition(async () => {
            await deleteFeedback(feedbackId, scriptId);
            router.refresh();
        });
    };

    const handleForceRelease = () => {
        if (!confirm("Force release the AI edit claim? This will re-queue the script for editing.")) return;
        startTransition(async () => {
            await forceReleaseEditClaim(scriptId);
            toast.success("Edit claim released");
            router.refresh();
        });
    };

    const isStale = editStatus === "ai_editing" && editClaimedAt &&
        (Date.now() - new Date(editClaimedAt).getTime()) > 30 * 60 * 1000;

    return (
        <div className="space-y-4 animate-in fade-in duration-300">
            {/* Edit status indicator */}
            {editStatus === "needs_ai_edit" && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                    <div className="w-2 h-2 rounded-full bg-amber-400" />
                    <span className="text-xs font-medium text-amber-700 dark:text-amber-300">Queued for AI edit</span>
                </div>
            )}
            {editStatus === "ai_editing" && (
                <div className="space-y-2">
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                        <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                        <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
                            AI editing now
                            {editClaimedAt && <span className="text-blue-500 dark:text-blue-400 ml-1">({relativeTime(editClaimedAt)})</span>}
                        </span>
                    </div>
                    {isStale && (
                        <button
                            onClick={handleForceRelease}
                            disabled={isPending}
                            className="flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-50"
                        >
                            <AlertTriangle size={12} />
                            Force release
                        </button>
                    )}
                </div>
            )}

            {/* Input */}
            <div>
                <h3 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider mb-3">AI Feedback</h3>
                <textarea
                    placeholder="What should the AI editor change about this script?"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    rows={3}
                    className="w-full bg-neutral-100 dark:bg-neutral-900 rounded-lg p-3 text-sm text-neutral-700 dark:text-neutral-300 outline-none resize-none placeholder:text-neutral-400 border border-transparent focus:border-neutral-200 dark:focus:border-neutral-800 transition-all"
                />
                <button
                    onClick={handleSubmit}
                    disabled={isPending || !content.trim()}
                    className="mt-2 w-full flex items-center justify-center gap-2 bg-neutral-900 text-neutral-50 dark:bg-neutral-100 dark:text-neutral-900 px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-all"
                >
                    <Send size={14} />
                    {isPending ? "Sending..." : "Send to AI editor"}
                </button>
            </div>

            {/* Feedback list */}
            {feedback.length > 0 && (
                <div className="space-y-3 pt-2 border-t border-neutral-200 dark:border-neutral-800">
                    <h4 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">History</h4>
                    {feedback.map((item) => (
                        <div key={item.id} className="group relative bg-neutral-50 dark:bg-neutral-900/50 rounded-lg p-3 border border-neutral-100 dark:border-neutral-800">
                            <div className="flex items-center justify-between mb-1.5">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-semibold text-neutral-500">Round {item.roundNumber}</span>
                                    {item.addressedAt ? (
                                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
                                            Addressed
                                        </span>
                                    ) : (
                                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                                            Pending
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-1">
                                    <span className="text-[10px] text-neutral-400">{relativeTime(item.createdAt)}</span>
                                    {!item.addressedAt && (
                                        <button
                                            onClick={() => handleDelete(item.id)}
                                            disabled={isPending}
                                            className="text-neutral-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-0.5 disabled:opacity-50"
                                            title="Delete feedback"
                                        >
                                            <X size={12} />
                                        </button>
                                    )}
                                </div>
                            </div>
                            <p className="text-sm text-neutral-600 dark:text-neutral-300 whitespace-pre-wrap leading-relaxed">{item.content}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
