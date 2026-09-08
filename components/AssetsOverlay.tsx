"use client";
/* eslint-disable @next/next/no-img-element -- originals are required for native long-press image saving */

import { useState, useEffect, useRef, useTransition } from "react";
import { ChevronLeft, ChevronRight, Download, Images, Plus, X } from "lucide-react";
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

export function AssetsTrigger({ onClick, count }: { onClick: () => void; count: number }) {
    return (
        <button className="as-trigger" onClick={onClick} aria-label={`Open assets (${count})`}>
            <Images size={16} aria-hidden="true" />
            <span className="as-trigger__label">Assets</span>
            <span className="as-trigger__count">{count}</span>
        </button>
    );
}

function OriginalImage({ image, number, canRetry = false }: { image: ScriptImage; number: number; canRetry?: boolean }) {
    const [failed, setFailed] = useState(false);
    return failed ? (
        <div className="as-image-error" role="status">
            <span>Image couldn’t load.</span>
            {canRetry && <button className="as-action" onClick={() => setFailed(false)}>Retry</button>}
        </div>
    ) : (
        <img
            src={image.imageUrl}
            alt={`Asset ${number}`}
            width={1080}
            height={1920}
            decoding="async"
            onError={() => setFailed(true)}
        />
    );
}

function DownloadLink({ id, number }: { id: string; number: number }) {
    // A same-origin attachment preserves the page and avoids cross-origin blob
    // navigation / immediate object-URL revocation on Safari.
    return (
        <a className="as-download" href={`/api/assets/${id}/download`} download aria-label={`Download asset ${number}`}>
            <Download size={16} aria-hidden="true" />
            <span>Download</span>
        </a>
    );
}

export function AssetsOverlay({ scriptId, images, onClose }: AssetsOverlayProps) {
    const [lightId, setLightId] = useState<string | null>(null);
    const [prompt, setPrompt] = useState("");
    const [isPending, startTransition] = useTransition();
    const [nearby, setNearby] = useState<Set<string>>(new Set());
    const [deleted, setDeleted] = useState<Set<string>>(new Set());
    const bodyRef = useRef<HTMLDivElement>(null);
    const overlayRef = useRef<HTMLDivElement>(null);
    const viewerRef = useRef<HTMLDivElement>(null);
    const lastImageRef = useRef<HTMLAnchorElement | null>(null);
    const router = useRouter();
    const items = images.filter((image) => !deleted.has(image.id));
    const light = items.findIndex((image) => image.id === lightId);
    const current = items[light];
    const storageKey = `assets-scroll:${scriptId}`;

    useEffect(() => {
        const previousFocus = document.activeElement as HTMLElement | null;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        overlayRef.current?.querySelector<HTMLButtonElement>(".as-modal__close")?.focus();
        return () => {
            document.body.style.overflow = previousOverflow;
            previousFocus?.focus();
        };
    }, []);

    const viewingImage = !!current;
    useEffect(() => {
        if (viewingImage) viewerRef.current?.querySelector<HTMLButtonElement>(".as-light__close")?.focus();
        else if (lastImageRef.current?.isConnected) lastImageRef.current.focus({ preventScroll: true });
        else overlayRef.current?.querySelector<HTMLButtonElement>(".as-modal__close")?.focus({ preventScroll: true });
    }, [viewingImage]);

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                if (lightId) setLightId(null);
                else onClose();
            }
            if (event.key === "ArrowLeft" && light > 0) setLightId(items[light - 1].id);
            if (event.key === "ArrowRight" && light >= 0 && light < items.length - 1) setLightId(items[light + 1].id);
            if (event.key !== "Tab") return;
            const root = current ? viewerRef.current : overlayRef.current?.querySelector(".as-modal");
            const controls = Array.from(root?.querySelectorAll<HTMLElement>("button:not(:disabled), a[href], input, summary") ?? [])
                .filter((node) => node.getClientRects().length > 0);
            const first = controls[0];
            const last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [lightId, light, current, items, onClose]);

    useEffect(() => {
        const body = bodyRef.current;
        if (!body) return;
        try { body.scrollTop = Number(sessionStorage.getItem(storageKey)) || 0; } catch { /* storage may be disabled */ }
        const remember = () => {
            try { sessionStorage.setItem(storageKey, String(body.scrollTop)); } catch { /* scrolling still works */ }
        };
        body.addEventListener("scroll", remember, { passive: true });
        window.addEventListener("pagehide", remember);
        return () => {
            remember();
            body.removeEventListener("scroll", remember);
            window.removeEventListener("pagehide", remember);
        };
    }, [storageKey]);

    useEffect(() => {
        const body = bodyRef.current;
        if (!body) return;
        // Keep lightweight, fixed-size card shells for scrolling, but mount
        // ORIGINAL <img>s only near the viewport. Lazy-loading alone accumulates
        // decoded originals and can kill a many-image iPhone tab (#4489).
        // Never display a resized src/srcset: native Save Image saves currentSrc.
        const observer = new IntersectionObserver((entries) => {
            setNearby((previous) => {
                const next = new Set(previous);
                for (const entry of entries) {
                    const id = (entry.target as HTMLElement).dataset.imageId!;
                    if (entry.isIntersecting) next.add(id); else next.delete(id);
                }
                return next;
            });
        }, { root: body, rootMargin: "160px 0px" });
        body.querySelectorAll("[data-image-id]").forEach((node) => observer.observe(node));
        return () => observer.disconnect();
    }, [images, deleted]);

    const handleDelete = (id: string) => {
        if (!confirm("Delete this image?")) return;
        startTransition(async () => {
            try {
                const result = await deleteScriptImage(id);
                if (!result.success) { toast.error("Failed to delete image"); return; }
                setDeleted((previous) => new Set([...previous, id]));
                setLightId(null);
                toast.success("Image deleted");
                router.refresh();
            } catch { toast.error("Failed to delete image"); }
        });
    };

    const handleGenerate = () => {
        if (isPending) return;
        startTransition(async () => {
            try {
                const result = await generateScriptImage(scriptId, prompt);
                if (result.success) {
                    toast.success("Generation started…");
                    setPrompt("");
                    router.refresh();
                } else { toast.error(result.error || "Failed to generate"); }
            } catch { toast.error("Failed to generate"); }
        });
    };

    return (
        <div className="as-overlay" ref={overlayRef} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
            <div className="as-modal" role="dialog" aria-modal="true" aria-label="Asset library" inert={!!current}>
                <header className="as-modal__head">
                    <div className="as-modal__title">
                        <h2>Assets</h2>
                        <span className="as-modal__title-meta">{items.length} images</span>
                    </div>
                    <button className="as-modal__close" onClick={onClose} aria-label="Close assets"><X size={20} /></button>
                </header>
                <div className="as-modal__body" ref={bodyRef}>
                    <p className="as-hint">Hold an image to save it in full resolution. Tap to enlarge.</p>
                    <details className="as-create">
                        <summary><Plus size={16} aria-hidden="true" /> Generate images</summary>
                        <div className="as-generate">
                            <input
                                className="as-generate__input"
                                placeholder="Prompt for new B-Roll…"
                                aria-label="Prompt for new B-Roll"
                                value={prompt}
                                onChange={(event) => setPrompt(event.target.value)}
                                onKeyDown={(event) => { if (event.key === "Enter") handleGenerate(); }}
                            />
                            <button className="as-generate__btn" onClick={handleGenerate} disabled={isPending}>
                                {isPending ? "Generating…" : "Generate"}
                            </button>
                        </div>
                    </details>
                    <div className="as-grid">
                        {items.length === 0 ? <div className="as-empty">No assets yet. Open Generate images to create your first B-Roll.</div> : items.map((image, index) => (
                            <article key={image.id} className="as-card">
                                <a
                                    className="as-card__thumb"
                                    data-image-id={image.id}
                                    href={image.imageUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={`Enlarge asset ${index + 1}`}
                                    onClick={(event) => {
                                        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                                        event.preventDefault();
                                        lastImageRef.current = event.currentTarget;
                                        setLightId(image.id);
                                    }}
                                >
                                    {!current && nearby.has(image.id) && <OriginalImage image={image} number={index + 1} />}
                                </a>
                                <div className="as-card__meta">
                                    <span className="as-card__name">{String(index + 1).padStart(2, "0")}</span>
                                    <DownloadLink id={image.id} number={index + 1} />
                                </div>
                            </article>
                        ))}
                    </div>
                </div>
            </div>
            {current && (
                <div className="as-light" ref={viewerRef} role="dialog" aria-modal="true" aria-label={`Asset ${light + 1} of ${items.length}`}>
                    <header className="as-light__head">
                        <button className="as-light__close as-action" onClick={() => setLightId(null)} aria-label="Back to gallery"><ChevronLeft size={18} /> Gallery</button>
                        <span className="as-light__count" aria-live="polite">{light + 1} / {items.length}</span>
                        <DownloadLink id={current.id} number={light + 1} />
                    </header>
                    <div className="as-light__img"><OriginalImage key={current.id} image={current} number={light + 1} canRetry /></div>
                    <footer className="as-light__foot">
                        <div className="as-light__nav">
                            <button className="as-action" disabled={light === 0} onClick={() => setLightId(items[light - 1].id)} aria-label="Previous image"><ChevronLeft size={20} /></button>
                            <span>Hold image to save</span>
                            <button className="as-action" disabled={light === items.length - 1} onClick={() => setLightId(items[light + 1].id)} aria-label="Next image"><ChevronRight size={20} /></button>
                        </div>
                        <details key={current.id} className="as-details">
                            <summary>Image details</summary>
                            <div className="as-details__body">
                                <p>{current.prompt || "No generation prompt saved for this image."}</p>
                                <a className="as-action" href={current.imageUrl} target="_blank" rel="noopener noreferrer">Open original</a>
                                <button className="as-action as-delete" onClick={() => handleDelete(current.id)} disabled={isPending}>Delete image</button>
                            </div>
                        </details>
                    </footer>
                </div>
            )}
        </div>
    );
}
