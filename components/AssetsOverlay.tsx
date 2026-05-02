"use client";

import { useState, useEffect, useTransition } from "react";
import { generateScriptImage, deleteScriptImage } from "@/app/actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface ScriptImage {
    id: string;
    imageUrl: string;
    prompt: string | null;
    createdAt: Date;
}

interface AssetsOverlayProps {
    scriptId: string;
    images: ScriptImage[];
    onClose: () => void;
}

const DownloadIcon = () => (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <path d="M7 10l5 5 5-5" />
        <path d="M12 15V3" />
    </svg>
);

const CloseIcon = ({ size = 15 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 6L6 18M6 6l12 12" />
    </svg>
);

const CheckIcon = () => (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 6L9 17l-5-5" />
    </svg>
);

const SparkIcon = () => (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" />
    </svg>
);

const PrevIcon = () => (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 18l-6-6 6-6" />
    </svg>
);

const NextIcon = () => (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18l6-6-6-6" />
    </svg>
);

const ImageIcon = () => (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="M21 15l-5-5L5 21" />
    </svg>
);

export function AssetsTrigger({ onClick, count }: { onClick: () => void; count: number }) {
    return (
        <button className="as-trigger" onClick={onClick} title="Open asset library">
            <ImageIcon />
            <span>Assets</span>
            <span className="as-trigger__count">{count}</span>
        </button>
    );
}

export function AssetsOverlay({ scriptId, images, onClose }: AssetsOverlayProps) {
    const [filter, setFilter] = useState<"all" | "motion" | "still">("all");
    const [selected, setSelected] = useState(new Set<string>());
    const [light, setLight] = useState<number | null>(null);
    const [prompt, setPrompt] = useState("");
    const [isPending, startTransition] = useTransition();
    const router = useRouter();

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                if (light !== null) setLight(null);
                else onClose();
            }
            if (e.key === "ArrowLeft" && light !== null && light > 0) setLight(light - 1);
            if (e.key === "ArrowRight" && light !== null && light < images.length - 1) setLight(light + 1);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [light, onClose, images.length]);

    const toggleSel = (id: string) => {
        const next = new Set(selected);
        if (next.has(id)) next.delete(id); else next.add(id);
        setSelected(next);
    };

    const handleDownload = async (url: string, id: string) => {
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = blobUrl;
            a.download = `b-roll-${id}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(blobUrl);
        } catch {
            window.open(url, "_blank");
        }
    };

    const handleDelete = (id: string) => {
        startTransition(async () => {
            const result = await deleteScriptImage(id);
            if (result.success) {
                toast.success("Deleted");
                router.refresh();
            } else {
                toast.error("Failed to delete");
            }
        });
    };

    const handleGenerate = () => {
        startTransition(async () => {
            const result = await generateScriptImage(scriptId, prompt);
            if (result.success) {
                toast.success("Generation started…");
                setPrompt("");
                router.refresh();
            } else {
                toast.error(result.error || "Failed to generate");
            }
        });
    };

    const items = images;

    return (
        <div
            className="as-overlay"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="as-modal" role="dialog" aria-label="Asset library">
                <header className="as-modal__head">
                    <div className="as-modal__title">
                        <h2>Assets</h2>
                        <span className="as-modal__title-meta">{images.length} files</span>
                    </div>

                    <div className="as-modal__filters">
                        <button className={"as-filter" + (filter === "all" ? " is-active" : "")} onClick={() => setFilter("all")}>All</button>
                        <button className={"as-filter" + (filter === "motion" ? " is-active" : "")} onClick={() => setFilter("motion")}>Motion</button>
                        <button className={"as-filter" + (filter === "still" ? " is-active" : "")} onClick={() => setFilter("still")}>Stills</button>
                    </div>

                    <div className="as-modal__actions">
                        <button className="as-modal__close" onClick={onClose} aria-label="Close">
                            <CloseIcon size={15} />
                        </button>
                    </div>
                </header>

                <div className="as-modal__body">
                    {/* Generate row */}
                    <div className="as-generate">
                        <input
                            className="as-generate__input"
                            placeholder="Prompt for new B-Roll…"
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") handleGenerate(); }}
                        />
                        <button
                            className="as-generate__btn"
                            onClick={handleGenerate}
                            disabled={isPending}
                            title="Generate B-Roll"
                        >
                            <SparkIcon />
                            <span>{isPending ? "Generating…" : "Generate"}</span>
                        </button>
                    </div>

                    {selected.size > 0 && (
                        <div className="as-selbar">
                            <div className="as-selbar__count">{selected.size} selected</div>
                            <div className="as-selbar__actions">
                                <button className="as-selbar__btn" onClick={() => setSelected(new Set())}>Clear</button>
                                <button className="as-selbar__btn as-selbar__btn--primary">
                                    Download {selected.size}
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="as-grid">
                        {items.length === 0 ? (
                            <div className="as-empty">No assets yet. Generate your first B-Roll above.</div>
                        ) : (
                            items.map((img, idx) => (
                                <article
                                    key={img.id}
                                    className={"as-card" + (selected.has(img.id) ? " is-selected" : "")}
                                    onClick={() => setLight(idx)}
                                >
                                    <div className="as-card__thumb">
                                        <img
                                            src={img.imageUrl}
                                            alt={img.prompt || "B-Roll"}
                                            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                                            loading="lazy"
                                        />
                                        <button
                                            className="as-card__check"
                                            onClick={(e) => { e.stopPropagation(); toggleSel(img.id); }}
                                            aria-label="Select"
                                        >
                                            <CheckIcon />
                                        </button>
                                        <button
                                            className="as-card__dl"
                                            onClick={(e) => { e.stopPropagation(); handleDownload(img.imageUrl, img.id); }}
                                            title="Download"
                                        >
                                            <DownloadIcon />
                                        </button>
                                    </div>
                                    <div className="as-card__meta">
                                        <span className="as-card__name">{img.prompt || `b-roll-${img.id.slice(0, 8)}`}</span>
                                        <span>9:16</span>
                                    </div>
                                </article>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Lightbox */}
            {light !== null && items[light] && (
                <div
                    className="as-light"
                    onClick={(e) => { if (e.target === e.currentTarget) setLight(null); }}
                >
                    <div className="as-light__img">
                        <img
                            src={items[light].imageUrl}
                            alt={items[light].prompt || "B-Roll"}
                            style={{ width: "100%", height: "100%", objectFit: "contain" }}
                        />
                    </div>
                    <button className="as-light__close" onClick={() => setLight(null)} aria-label="Close">
                        <CloseIcon size={16} />
                    </button>
                    {light > 0 && (
                        <button className="as-light__nav as-light__nav--prev" onClick={() => setLight(light - 1)} aria-label="Previous">
                            <PrevIcon />
                        </button>
                    )}
                    {light < items.length - 1 && (
                        <button className="as-light__nav as-light__nav--next" onClick={() => setLight(light + 1)} aria-label="Next">
                            <NextIcon />
                        </button>
                    )}
                    <div className="as-light__caption">
                        <span>{items[light].prompt || "B-Roll"}</span>
                        <span>·</span>
                        <span>9:16</span>
                        <span>·</span>
                        <button
                            className="as-light__dl"
                            onClick={() => handleDownload(items[light].imageUrl, items[light].id)}
                        >
                            <DownloadIcon />
                            <span>Download</span>
                        </button>
                        <button
                            className="as-light__dl"
                            onClick={() => handleDelete(items[light].id)}
                            style={{ color: "var(--accent)" }}
                        >
                            <span>Delete</span>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
