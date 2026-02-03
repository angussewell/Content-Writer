"use client";

import { useTransition } from "react";
import { Download, Trash2, ExternalLink, RefreshCw } from "lucide-react";
import { deleteScriptImage } from "@/app/actions";
import { toast } from "sonner";
import Image from "next/image";
import { useRouter } from "next/navigation";

interface ScriptImage {
    id: string;
    imageUrl: string;
    prompt: string | null;
    createdAt: Date;
}

export default function ImageGallery({ images }: { images: ScriptImage[] }) {
    const [isPending, startTransition] = useTransition();
    const router = useRouter();

    const handleDelete = (id: string) => {
        if (!confirm("Delete this image?")) return;

        startTransition(async () => {
            const result = await deleteScriptImage(id);
            if (result.success) {
                toast.success("Image deleted");
            } else {
                toast.error("Failed to delete image");
            }
        });
    };

    const handleDownload = async (url: string, id: string) => {
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = blobUrl;
            link.download = `b-roll-${id}.png`; // Assuming PNG, but URL might dictate extension
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (e) {
            console.error(e);
            window.open(url, "_blank");
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider">Gallery ({images.length})</h3>
                <button
                    onClick={() => router.refresh()}
                    className="p-1 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-md transition-colors text-neutral-500"
                    title="Refresh Gallery"
                >
                    <RefreshCw size={14} />
                </button>
            </div>

            {images.length === 0 ? (
                <div className="text-center py-10 opacity-50 border border-dashed border-neutral-200 dark:border-neutral-800 rounded-lg">
                    <p className="text-sm text-neutral-400">No assets generated yet.</p>
                </div>
            ) : (
                <div className="grid grid-cols-2 gap-3">
                    {images.map((img) => (
                        <div key={img.id} className="group relative aspect-[9/16] bg-neutral-100 dark:bg-neutral-800 rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-800 animate-in fade-in duration-500">
                            <img
                                src={img.imageUrl}
                                alt={img.prompt || "Generated B-Roll"}
                                className="w-full h-full object-cover"
                                loading="lazy"
                            />

                            {/* Overlay */}
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2 gap-2">
                                <div className="flex items-center gap-1 justify-between">
                                    <button
                                        onClick={() => handleDownload(img.imageUrl, img.id)}
                                        className="p-1.5 bg-white/10 hover:bg-white/20 text-white rounded-md backdrop-blur-sm transition-colors"
                                        title="Download"
                                    >
                                        <Download size={14} />
                                    </button>
                                    <button
                                        onClick={() => window.open(img.imageUrl, '_blank')}
                                        className="p-1.5 bg-white/10 hover:bg-white/20 text-white rounded-md backdrop-blur-sm transition-colors"
                                        title="Open Full Size"
                                    >
                                        <ExternalLink size={14} />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(img.id)}
                                        disabled={isPending}
                                        className="p-1.5 bg-red-500/20 hover:bg-red-500/40 text-red-200 rounded-md backdrop-blur-sm transition-colors"
                                        title="Delete"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
