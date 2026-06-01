"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { archiveYoutubeIdea, restoreYoutubeIdea } from "@/app/actions";
import { reactionPrompt } from "@/app/ideas/IdeasClient";

export function YoutubeDetailActions({
  id,
  title,
  archived,
}: {
  id: string;
  title: string;
  archived: boolean;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (copyTimer.current) clearTimeout(copyTimer.current);
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  function showToast(text: string) {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  }

  async function copyPrompt() {
    const text = reactionPrompt({ id, title });
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1600);
    showToast("Reaction-prep prompt copied");
  }

  function toggleArchive() {
    startTransition(async () => {
      if (archived) {
        await restoreYoutubeIdea(id);
        showToast("Concept restored");
      } else {
        await archiveYoutubeIdea(id);
        showToast("Concept archived");
        router.push("/ideas?dataset=youtube");
      }
    });
  }

  return (
    <>
      <div className="ytd-actions">
        <button
          className={"ytd-prep" + (copied ? " ytd-prep--copied" : "")}
          onClick={copyPrompt}
        >
          {copied ? (
            <>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M3 7 L6 10 L11 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>Prompt copied</span>
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M3.5 1.5 H9 L12 4.5 V12.5 H3.5 Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                <path d="M5.5 6.4 L7 7.9 L9.6 4.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>Copy reaction-prep prompt</span>
            </>
          )}
        </button>
        <button className="ytd-archive" onClick={toggleArchive} disabled={pending}>
          {archived ? (
            <>
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                <path d="M3 7 A4 4 0 1 0 5 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="none" />
                <path d="M3 2 V4 H5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>Restore</span>
            </>
          ) : (
            <>
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                <rect x="2" y="3" width="10" height="2" rx="0.6" stroke="currentColor" strokeWidth="1.3" />
                <path d="M3 5 V11 H11 V5" stroke="currentColor" strokeWidth="1.3" />
                <path d="M5.5 7.5 H8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              <span>Archive</span>
            </>
          )}
        </button>
      </div>
      <div className={"toast" + (toast ? " show" : "")}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M2.5 7 L5.5 10 L11.5 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>{toast ?? ""}</span>
      </div>
    </>
  );
}
