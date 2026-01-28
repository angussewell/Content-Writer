"use client";

import { useState, useTransition } from "react";
import TextareaAutosize from "react-textarea-autosize";
import { ArrowLeft, Save, Plus, Trash2, ChevronRight, ChevronDown } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateScript, deleteScript, updateScriptStatus } from "@/app/actions";

interface Intro {
    id: string; // can be uuid or temp id
    titleHook: string;
    verbalIntro: string;
    isNew?: boolean;
    isDeleted?: boolean;
}

interface ContextItem {
    id: string;
    content: string;
    isNew?: boolean;
}

interface ScriptData {
    id: string;
    title: string;
    body: string;
    status: "draft" | "filmed" | "done" | "archived";
    intros: Intro[];
    contextItems?: ContextItem[];
}

export default function Editor({ initialData }: { initialData: ScriptData }) {
    const [data, setData] = useState<ScriptData>(initialData);
    const [isPending, startTransition] = useTransition();
    const [isContextOpen, setIsContextOpen] = useState(false);
    const router = useRouter();

    const handleSave = () => {
        // Ensure we always have an array, even if empty
        const payloadContextItems = data.contextItems || [];

        console.log("Saving script. sending contextItems:", payloadContextItems);

        startTransition(async () => {
            try {
                await updateScript(data.id, {
                    title: data.title,
                    body: data.body,
                    intros: data.intros,
                    contextItems: payloadContextItems,
                });
                toast.success("Saved");
                router.refresh(); // Refresh to ensure server data is synced
            } catch (e) {
                console.error("Failed to save script:", e);
                toast.error("Failed to save");
            }
        });
    };

    const addIntro = () => {
        setData((prev) => ({
            ...prev,
            intros: [
                ...prev.intros,
                {
                    id: crypto.randomUUID(), // temp ID
                    titleHook: "",
                    verbalIntro: "",
                    isNew: true,
                },
            ],
        }));
    };

    const updateIntro = (id: string, field: "titleHook" | "verbalIntro", value: string) => {
        setData((prev) => ({
            ...prev,
            intros: prev.intros.map((intro) =>
                intro.id === id ? { ...intro, [field]: value } : intro
            ),
        }));
    };

    const removeIntro = (id: string) => {
        setData((prev) => ({
            ...prev,
            intros: prev.intros.filter((i) => i.id !== id),
        }));
    };

    const addContextItem = () => {
        setData((prev) => ({
            ...prev,
            contextItems: [
                ...(prev.contextItems || []),
                {
                    id: crypto.randomUUID(),
                    content: "",
                    isNew: true,
                },
            ],
        }));
    };

    const updateContextItem = (id: string, value: string) => {
        setData((prev) => ({
            ...prev,
            contextItems: (prev.contextItems || []).map((item) =>
                item.id === id ? { ...item, content: value } : item
            ),
        }));
    };

    const removeContextItem = (id: string) => {
        setData((prev) => ({
            ...prev,
            contextItems: (prev.contextItems || []).filter((i) => i.id !== id),
        }));
    };

    return (
        <div className="min-h-screen relative font-sans bg-white dark:bg-black text-neutral-900 dark:text-neutral-100">
            <header className="w-full px-8 py-4 flex items-center justify-between sticky top-0 bg-white/80 dark:bg-black/80 backdrop-blur-md z-10 border-b border-transparent">
                <Link
                    href="/"
                    className="text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
                >
                    <ArrowLeft size={20} />
                </Link>

                <div className="flex items-center gap-3">
                    <div className="relative group">
                        <select
                            value={data.status}
                            onChange={(e) => {
                                const newStatus = e.target.value as any;
                                setData({ ...data, status: newStatus });
                                startTransition(async () => {
                                    await updateScriptStatus(data.id, newStatus);
                                    toast.success("Status updated");
                                });
                            }}
                            className="appearance-none bg-neutral-100 dark:bg-neutral-900 border border-transparent hover:border-neutral-200 dark:hover:border-neutral-800 text-neutral-600 dark:text-neutral-400 text-xs font-medium px-3 py-1.5 rounded-md cursor-pointer focus:outline-none pr-8 transition-all capitalize"
                        >
                            <option value="draft">Draft</option>
                            <option value="filmed">Filmed</option>
                            <option value="done">Done</option>
                            <option value="archived">Archived</option>
                        </select>
                        <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
                    </div>

                    <div className="w-px h-6 bg-neutral-200 dark:bg-neutral-800 mx-1" />

                    <button
                        onClick={() => {
                            if (window.confirm("Are you sure you want to delete this script?")) {
                                startTransition(async () => {
                                    await deleteScript(data.id);
                                });
                            }
                        }}
                        disabled={isPending}
                        className="text-neutral-500 hover:text-red-500 transition-colors p-2 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-900"
                        title="Delete Script"
                    >
                        <Trash2 size={20} />
                    </button>
                    <div className="w-px h-6 bg-neutral-200 dark:bg-neutral-800 mx-1" />
                    <button
                        onClick={handleSave}
                        disabled={isPending}
                        className="flex items-center gap-2 bg-neutral-900 text-neutral-50 dark:bg-neutral-100 dark:text-neutral-900 px-4 py-2 rounded-full text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-all font-sans"
                    >
                        {isPending ? "Saving..." : (
                            <>
                                <Save size={14} />
                                <span>Save</span>
                            </>
                        )}
                    </button>
                </div>
            </header>

            <main className="max-w-4xl mx-auto p-6 md:p-12 pb-32">
                <div className="space-y-12">
                    {/* Title */}
                    <TextareaAutosize
                        placeholder="Untitled Script"
                        value={data.title}
                        onChange={(e) => setData({ ...data, title: e.target.value })}
                        className="w-full text-5xl font-bold bg-transparent border-none placeholder:text-neutral-300 dark:placeholder:text-neutral-700 outline-none resize-none"
                    />

                    {/* Context Section */}
                    <section className="border-b border-neutral-100 dark:border-neutral-900 pb-8">
                        <button
                            onClick={() => setIsContextOpen(!isContextOpen)}
                            className="flex items-center gap-2 text-xs font-semibold text-neutral-400 uppercase tracking-wider hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors mb-4"
                        >
                            {isContextOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            Script Context
                        </button>

                        {isContextOpen && (
                            <div className="space-y-4 pl-6 animate-in fade-in slide-in-from-top-2 duration-200">
                                <div className="space-y-3">
                                    {(data.contextItems || []).map((item) => (
                                        <div key={item.id} className="flex items-start gap-2 group">
                                            <TextareaAutosize
                                                placeholder="Add context (e.g., Target Audience: Gen Z)..."
                                                value={item.content}
                                                onChange={(e) => updateContextItem(item.id, e.target.value)}
                                                className="flex-1 bg-transparent text-sm text-neutral-600 dark:text-neutral-400 outline-none resize-none placeholder:text-neutral-300 dark:placeholder:text-neutral-700 font-normal leading-relaxed border-b border-transparent focus:border-neutral-200 dark:focus:border-neutral-800 transition-colors pb-1"
                                                minRows={1}
                                            />
                                            <button
                                                onClick={() => removeContextItem(item.id)}
                                                className="text-neutral-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all pt-1"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                <button
                                    onClick={addContextItem}
                                    className="text-xs text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 flex items-center gap-1 transition-colors mt-2"
                                >
                                    <Plus size={12} /> Add Context Item
                                </button>
                            </div>
                        )}
                    </section>

                    {/* Intros Section */}
                    <section className="space-y-6">
                        <div className="flex items-center justify-between text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                            <h2>Intros / Hooks</h2>
                            <button onClick={addIntro} className="hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors p-1">
                                <Plus size={14} />
                            </button>
                        </div>
                        <div className="space-y-8">
                            {data.intros.map((intro, index) => (
                                <div key={intro.id} className="group relative pl-4 border-l-2 border-neutral-200 dark:border-neutral-800 transition-colors hover:border-neutral-300 dark:hover:border-neutral-600">
                                    <div className="absolute top-0 -left-8 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => removeIntro(intro.id)} className="text-neutral-300 hover:text-red-500 p-2">
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                    <div className="space-y-4">
                                        <div>
                                            <TextareaAutosize
                                                placeholder="Title Hook (Text on screen)..."
                                                value={intro.titleHook}
                                                onChange={(e) => updateIntro(intro.id, "titleHook", e.target.value)}
                                                className="w-full bg-transparent text-2xl font-semibold outline-none resize-none placeholder:text-neutral-300 dark:placeholder:text-neutral-700"
                                            />
                                        </div>
                                        <div>
                                            <TextareaAutosize
                                                placeholder="Verbal Intro (What you say)..."
                                                value={intro.verbalIntro}
                                                onChange={(e) => updateIntro(intro.id, "verbalIntro", e.target.value)}
                                                className="w-full bg-transparent text-lg text-neutral-600 dark:text-neutral-300 outline-none resize-none placeholder:text-neutral-300 dark:placeholder:text-neutral-700 font-normal leading-relaxed"
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {data.intros.length === 0 && (
                                <div className="text-center py-8 border border-dashed border-neutral-200 dark:border-neutral-800 rounded-xl text-neutral-400 text-sm">
                                    No intros yet. <button onClick={addIntro} className="underline hover:text-neutral-500">Add one</button>
                                </div>
                            )}
                        </div>
                    </section>

                    <hr className="border-neutral-100 dark:border-neutral-900" />

                    {/* Body */}
                    <section>
                        <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-4">Body Content</div>
                        <TextareaAutosize
                            placeholder="Write your script body here..."
                            value={data.body}
                            onChange={(e) => setData({ ...data, body: e.target.value })}
                            className="w-full text-lg leading-relaxed bg-transparent border-none placeholder:text-neutral-300 dark:placeholder:text-neutral-700 outline-none resize-none font-serif-video"
                            minRows={10}
                        />
                    </section>
                </div>
            </main>
        </div>
    );
}
