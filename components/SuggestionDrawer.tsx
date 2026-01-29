"use client";

import { useState, useEffect, useTransition } from "react";
import { Sparkles, X, RefreshCw, Check } from "lucide-react";
import { generateSuggestion, getSuggestions, applySuggestion } from "@/app/actions";
import { toast } from "sonner";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";


interface SuggestionContent {
    alternatives?: any[];
    score?: number;
    [key: string]: any;
}

interface SuggestionRecord {
    id: string;
    score: number | null;
    content: SuggestionContent;
    createdAt: Date;
}

interface SuggestionDrawerProps {
    introId: string | null;
    type: "hook" | "intro" | null;
    currentText: string;
    isOpen: boolean;
    onClose: () => void;
}


function cn(...inputs: (string | undefined | null | false)[]) {
    return twMerge(clsx(inputs));
}

export default function SuggestionDrawer({ introId, type, currentText, isOpen, onClose }: SuggestionDrawerProps) {
    const [history, setHistory] = useState<SuggestionRecord[]>([]);
    const [isPending, startTransition] = useTransition();

    useEffect(() => {
        if (isOpen && introId && type) {
            startTransition(async () => {
                const suggestions = await getSuggestions(introId, type);
                setHistory(suggestions as any as SuggestionRecord[]);
            });
        }
    }, [isOpen, introId, type]);

    const handleAnalyze = () => {
        if (!introId || !type) return;

        startTransition(async () => {
            const result = await generateSuggestion(introId, type, currentText);
            if (result.error) {
                toast.error(result.error);
            } else {
                // Refresh history
                const suggestions = await getSuggestions(introId, type);
                setHistory(suggestions as any as SuggestionRecord[]);
                toast.success("Analysis complete");
            }
        });
    };

    const handleReplace = (content: string) => {
        if (!introId || !type) return;

        startTransition(async () => {
            await applySuggestion(introId, type, content);
            toast.success("Updated!");
        });
    };

    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop */}
            <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 transition-opacity" onClick={onClose} />

            {/* Drawer */}
            <div className="fixed top-0 right-0 h-full w-[400px] bg-white dark:bg-neutral-950 shadow-2xl z-50 border-l border-neutral-200 dark:border-neutral-800 flex flex-col transform transition-transform duration-300 ease-in-out animate-in slide-in-from-right">
                {/* Header */}
                <div className="p-6 border-b border-neutral-100 dark:border-neutral-900 flex items-center justify-between bg-white/50 dark:bg-black/50 backdrop-blur-md">
                    <h2 className="text-lg font-bold flex items-center gap-2">
                        <Sparkles size={18} className="text-amber-400" />
                        AI Feedback Loop
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-900 rounded-full transition-colors">
                        <X size={16} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-8">
                    {/* Current Draft Section */}
                    <section>
                        <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">Current Draft</h3>
                        <div className="p-4 bg-neutral-50 dark:bg-neutral-900/50 rounded-xl border border-neutral-100 dark:border-neutral-800 text-sm leading-relaxed whitespace-pre-wrap">
                            {currentText || <span className="text-neutral-400 italic">Empty draft...</span>}
                        </div>
                        <button
                            onClick={handleAnalyze}
                            disabled={isPending}
                            className="w-full mt-4 flex items-center justify-center gap-2 bg-neutral-900 text-white dark:bg-white dark:text-black py-3 rounded-lg font-medium text-sm hover:opacity-90 disabled:opacity-50 transition-all cursor-pointer"
                        >
                            {isPending ? <RefreshCw size={16} className="animate-spin" /> : <Sparkles size={16} />}
                            {isPending ? "Analyzing..." : `Analyze ${type === 'hook' ? 'Hook' : 'Intro'}`}
                        </button>
                    </section>

                    {/* History Section */}
                    {history.length > 0 && (
                        <section>
                            <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">Suggestion History</h3>
                            <div className="space-y-4">
                                {history.map((record) => {
                                    const data = record.content;
                                    const score = record.score ?? 0;
                                    const scoreColor = score >= 70 ? "text-green-500 bg-green-50 dark:bg-green-900/20" : score < 50 ? "text-red-500 bg-red-50 dark:bg-red-900/20" : "text-amber-500 bg-amber-50 dark:bg-amber-900/20";

                                    return (
                                        <div key={record.id} className="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden">
                                            <div className="p-3 bg-neutral-50 dark:bg-neutral-900/50 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
                                                <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", scoreColor)}>
                                                    Score: {score}/100
                                                </span>
                                                <span className="text-xs text-neutral-400">
                                                    {new Date(record.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                            <div className="p-4 space-y-4">
                                                {/* Alternatives */}
                                                {data.alternatives && Array.isArray(data.alternatives) && data.alternatives.map((alt: any, idx: number) => {
                                                    const text = typeof alt === 'string' ? alt : (alt.hook || alt.text || alt.intro || JSON.stringify(alt));
                                                    return (
                                                        <div key={idx} className="group relative pl-3 border-l-2 border-transparent hover:border-green-500 transition-colors">
                                                            <div className="text-sm text-neutral-700 dark:text-neutral-300 pr-8">
                                                                <p className="font-medium">{text}</p>
                                                                {typeof alt === 'object' && alt.structure && (
                                                                    <p className="text-xs text-neutral-400 mt-1">Structure: {alt.structure}</p>
                                                                )}
                                                                {typeof alt === 'object' && alt.reasoning && (
                                                                    <p className="text-xs text-neutral-500 italic mt-1">{alt.reasoning}</p>
                                                                )}
                                                            </div>
                                                            <button
                                                                onClick={() => handleReplace(text)}
                                                                className="absolute top-0 right-0 p-1.5 text-neutral-400 hover:text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 rounded transition-all opacity-0 group-hover:opacity-100 cursor-pointer"
                                                                title="Replace with this version"
                                                            >
                                                                <Check size={14} />
                                                            </button>
                                                        </div>
                                                    );
                                                })}
                                                {(!data.alternatives || data.alternatives.length === 0) && (
                                                    <p className="text-sm text-neutral-500 italic">No specific alternatives provided.</p>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    )}
                </div>
            </div>
        </>
    );
}
