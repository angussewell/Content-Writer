"use client";

import { useState, useTransition } from "react";
import { Sparkles, Loader2, Settings2 } from "lucide-react";
import { generateScriptImage } from "@/app/actions";
import { toast } from "sonner";

interface ImageGeneratorProps {
    scriptId: string;
}

export default function ImageGenerator({ scriptId }: ImageGeneratorProps) {
    const [isPending, startTransition] = useTransition();
    const [prompt, setPrompt] = useState("");
    const [isOpen, setIsOpen] = useState(false);

    const handleGenerate = () => {
        setIsOpen(false); // Close popover if open
        startTransition(async () => {
            const result = await generateScriptImage(scriptId, prompt);
            if (result.success) {
                toast.success("Generation started... check back shortly");
                setPrompt("");
            } else {
                toast.error(result.error || "Failed to generate image");
            }
        });
    };

    return (
        <div className="space-y-4 mb-8">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider">B-Roll Generation</h3>
            </div>

            <div className="bg-neutral-100 dark:bg-neutral-900 p-4 rounded-xl border border-neutral-200 dark:border-neutral-800">
                <div className="space-y-3">
                    <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400">
                        Custom Prompt (Optional)
                    </label>
                    <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="e.g. Cinematic view of a minimalist desk setup, soft lighting..."
                        className="w-full bg-white dark:bg-neutral-950 text-sm p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 outline-none focus:ring-2 ring-neutral-900/10 dark:ring-neutral-100/10 resize-none h-20 placeholder:text-neutral-400"
                    />

                    <button
                        onClick={handleGenerate}
                        disabled={isPending}
                        className="w-full flex items-center justify-center gap-2 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 py-2.5 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-all shadow-sm"
                    >
                        {isPending ? (
                            <>
                                <Loader2 size={16} className="animate-spin" />
                                <span>Generating...</span>
                            </>
                        ) : (
                            <>
                                <Sparkles size={16} />
                                <span>Generate B-Roll</span>
                            </>
                        )}
                    </button>
                    <p className="text-[10px] text-center text-neutral-400">
                        Includes script context • 9:16 Aspect Ratio
                    </p>
                </div>
            </div>
        </div>
    );
}
