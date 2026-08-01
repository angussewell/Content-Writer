"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import TextareaAutosize from "react-textarea-autosize";
import { updateYoutubeThumbnailNotes } from "@/app/actions";

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

const SAVE_LABEL: Record<SaveState, string> = {
  idle: "Up to date",
  dirty: "Unsaved",
  saving: "Saving…",
  saved: "Saved",
  error: "Save failed",
};

export default function ThumbnailSketch({
  ideaId,
  initialNotes,
}: {
  ideaId: string;
  initialNotes: string;
}) {
  const [notes, setNotes] = useState(initialNotes);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const savedRef = useRef(initialNotes);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(async (next: string) => {
    if (next === savedRef.current) {
      setSaveState("idle");
      return;
    }

    setSaveState("saving");
    try {
      await updateYoutubeThumbnailNotes(ideaId, next);
      savedRef.current = next;
      setSaveState("saved");
      if (resetRef.current) clearTimeout(resetRef.current);
      resetRef.current = setTimeout(() => setSaveState("idle"), 1800);
    } catch {
      setSaveState("error");
    }
  }, [ideaId]);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (resetRef.current) clearTimeout(resetRef.current);
  }, []);

  const changeNotes = (next: string) => {
    setNotes(next);
    setSaveState("dirty");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => save(next), 900);
  };

  const saveNow = (currentValue: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    void save(currentValue);
  };

  return (
    <section className="thumb-sketch" aria-labelledby="thumbnail-sketch-title">
      <div className="thumb-sketch__head">
        <div>
          <span className="thumb-sketch__eyebrow">Packaging</span>
          <h2 id="thumbnail-sketch-title" className="thumb-sketch__title">Thumbnail sketch</h2>
          <p className="thumb-sketch__intro">
            Lock the visual promise before the script gets expensive.
          </p>
        </div>
        <span
          className={`thumb-sketch__save thumb-sketch__save--${saveState}`}
          role="status"
          aria-live="polite"
        >
          <span className="thumb-sketch__save-dot" />
          {SAVE_LABEL[saveState]}
        </span>
      </div>

      <div className="thumb-sketch__body">
        <div className="thumb-frame" aria-hidden="true">
          <div className="thumb-frame__safe">
            <span className="thumb-frame__subject">Subject</span>
            <span className="thumb-frame__copy">1–4 words</span>
          </div>
          <span className="thumb-frame__ratio">16:9 composition</span>
        </div>

        <div className="thumb-sketch__editor">
          <label className="thumb-sketch__label" htmlFor="thumbnail-notes">
            What should someone see?
          </label>
          <TextareaAutosize
            id="thumbnail-notes"
            className="thumb-sketch__textarea"
            value={notes}
            minRows={5}
            spellCheck
            placeholder={"Subject, expression, composition, proof, contrast, text…\n\nWhat creates the click before they read the title?"}
            onChange={(event) => changeNotes(event.target.value)}
            onBlur={(event) => saveNow(event.currentTarget.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                saveNow(event.currentTarget.value);
              }
            }}
          />
          <p className="thumb-sketch__hint">Auto-saves · ⌘↵ saves now</p>
        </div>
      </div>
    </section>
  );
}
