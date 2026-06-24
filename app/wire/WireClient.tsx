"use client";

import { useState, useTransition, useRef, useEffect, useCallback } from "react";
import type { BuzzStory } from "./page";
import { spikeBuzzStory, restoreBuzzStory } from "@/app/actions";

function normPlatforms(p: string[] | null): string[] {
  if (!p) return [];
  const out = new Set<string>();
  for (const raw of p) {
    const v = raw.toLowerCase();
    if (v === "x" || v === "twitter") out.add("X");
    else if (v === "reddit") out.add("Reddit");
    else out.add(raw);
  }
  return [...out];
}

function scoreTier(s: number | null): "hot" | "warm" | "cool" {
  if (s == null) return "cool";
  if (s >= 80) return "hot";
  if (s >= 60) return "warm";
  return "cool";
}

function storyPrompt(story: BuzzStory) {
  const head = `Buzz story #${story.id}: "${story.summary}"`;
  const withAngle = story.react_angle ? `${head} — angle: ${story.react_angle}` : head;
  return story.top_url ? `${withAngle}\nSource: ${story.top_url}` : withAngle;
}

export function WireClient({
  stories,
  peakBuzz,
  showLead,
}: {
  stories: BuzzStory[];
  peakBuzz: number;
  showLead: boolean;
}) {
  const [toast, setToast] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [cursor, setCursor] = useState<number>(-1);
  const [pending, startTransition] = useTransition();
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowRefs = useRef<(HTMLElement | null)[]>([]);
  const navByKey = useRef(false);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
  }, []);

  const showToast = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1900);
  }, []);

  const assign = useCallback(async (story: BuzzStory) => {
    try {
      await navigator.clipboard.writeText(storyPrompt(story));
    } catch {
      /* ignore */
    }
    setCopiedId(story.id);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopiedId(null), 1700);
    showToast("Prompt copied — paste into Claude Code");
  }, [showToast]);

  const spike = useCallback((id: number) => {
    startTransition(async () => {
      await spikeBuzzStory(id);
      showToast("Spiked");
    });
  }, [showToast]);

  const restore = useCallback((id: number) => {
    startTransition(async () => {
      await restoreBuzzStory(id);
      showToast("Back on the wire");
    });
  }, [showToast]);

  const openSource = useCallback((story: BuzzStory) => {
    if (story.top_url) window.open(story.top_url, "_blank", "noopener,noreferrer");
  }, []);

  // Keyboard triage
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (!stories.length) return;
      const k = e.key.toLowerCase();
      if (k === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        navByKey.current = true;
        setCursor((c) => Math.min(stories.length - 1, c < 0 ? 0 : c + 1));
      } else if (k === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        navByKey.current = true;
        setCursor((c) => Math.max(0, c < 0 ? 0 : c - 1));
      } else if (cursor >= 0) {
        const story = stories[cursor];
        if (!story) return;
        if (e.key === "Enter") { e.preventDefault(); assign(story); }
        else if (k === "x") { e.preventDefault(); story.surfaced ? restore(story.id) : spike(story.id); }
        else if (k === "o") { e.preventDefault(); openSource(story); }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stories, cursor, assign, spike, restore, openSource]);

  useEffect(() => {
    if (cursor >= 0 && navByKey.current) {
      rowRefs.current[cursor]?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    navByKey.current = false;
  }, [cursor]);

  if (!stories.length) {
    return (
      <>
        <div className="empty">
          <div className="empty__mark">❦</div>
          <p className="empty__txt">The wire is quiet. Nothing is buzzing under this filter.</p>
        </div>
        <Toast text={toast} />
      </>
    );
  }

  const leadCount = showLead ? 1 : 0;
  const lead = showLead ? stories[0] : null;
  const feed = stories.slice(leadCount);

  return (
    <>
      {lead && (
        <LeadStory
          story={lead}
          peakBuzz={peakBuzz}
          active={cursor === 0}
          copied={copiedId === lead.id}
          pending={pending}
          assign={assign}
          spike={spike}
          restore={restore}
          openSource={openSource}
          setRef={(el) => (rowRefs.current[0] = el)}
          onFocus={() => setCursor(0)}
        />
      )}

      {feed.length > 0 && (
        <div className="wire-feed">
          <div className="wire-feed__head">
            <span className="wire-feed__label">{lead ? "Also moving" : "The tape"}</span>
            <span className="wire-feed__rule" />
            <span className="wire-feed__count">{feed.length} {feed.length === 1 ? "story" : "stories"}</span>
          </div>

          {feed.map((story, i) => {
            const idx = i + leadCount;
            return (
              <WireRow
                key={story.id}
                story={story}
                rank={idx + 1}
                peakBuzz={peakBuzz}
                active={cursor === idx}
                copied={copiedId === story.id}
                pending={pending}
                assign={assign}
                spike={spike}
                restore={restore}
                openSource={openSource}
                setRef={(el) => (rowRefs.current[idx] = el)}
                onFocus={() => setCursor(idx)}
              />
            );
          })}
        </div>
      )}

      <div className="wire-keyhint">
        <Key>J</Key><Key>K</Key> move
        <span className="wire-keyhint__sep" />
        <Key>↵</Key> copy
        <span className="wire-keyhint__sep" />
        <Key>X</Key> spike
        <span className="wire-keyhint__sep" />
        <Key>O</Key> open source
      </div>

      <Toast text={toast} />
    </>
  );
}

type RowProps = {
  story: BuzzStory;
  peakBuzz: number;
  active: boolean;
  copied: boolean;
  pending: boolean;
  assign: (s: BuzzStory) => void;
  spike: (id: number) => void;
  restore: (id: number) => void;
  openSource: (s: BuzzStory) => void;
  setRef: (el: HTMLElement | null) => void;
  onFocus: () => void;
};

function LeadStory({ story, peakBuzz, active, copied, pending, assign, spike, restore, openSource, setRef, onFocus }: RowProps) {
  const tier = scoreTier(story.interest_score);
  const platforms = normPlatforms(story.platforms);
  return (
    <article
      ref={setRef}
      className={"wire-lead" + (active ? " is-active" : "") + (story.surfaced ? " is-spiked" : "")}
      data-tier={tier}
      onMouseEnter={onFocus}
    >
      <div className="wire-lead__rail">
        <ScoreStamp score={story.interest_score} tier={tier} lead />
        <BuzzMeter count={story.buzz_count} peak={peakBuzz} />
      </div>

      <div className="wire-lead__main">
        <div className="wire-lead__kicker">
          <span className={"wire-kicker__flag wire-kicker__flag--" + tier}>Lead story</span>
          {platforms.map((p) => <SourceStamp key={p} platform={p} />)}
          <span className="wire-lead__id">#{story.id}</span>
        </div>

        <h2 className="wire-lead__headline">{story.summary}</h2>

        {story.react_angle && (
          <blockquote className="wire-angle wire-angle--lead">
            <span className="wire-angle__tab">The angle</span>
            <p className="wire-angle__text">{story.react_angle}</p>
          </blockquote>
        )}

        <div className="wire-actions wire-actions--lead">
          <button
            className={"wire-btn wire-btn--assign" + (copied ? " is-done" : "")}
            onClick={() => assign(story)}
          >
            {copied ? <CheckIcon /> : <AssignIcon />}
            <span>{copied ? "Copied" : "Copy prompt"}</span>
          </button>
          {story.top_url && (
            <button className="wire-btn" onClick={() => openSource(story)}>
              <SourceIcon /><span>Read source</span>
            </button>
          )}
          {story.surfaced ? (
            <button className="wire-btn wire-btn--ghost" onClick={() => restore(story.id)} disabled={pending}>
              <RestoreIcon /><span>Restore</span>
            </button>
          ) : (
            <button className="wire-btn wire-btn--ghost" onClick={() => spike(story.id)} disabled={pending}>
              <SpikeIcon /><span>Spike</span>
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function WireRow({ story, rank, peakBuzz, active, copied, pending, assign, spike, restore, openSource, setRef, onFocus }: RowProps & { rank: number }) {
  const tier = scoreTier(story.interest_score);
  const platforms = normPlatforms(story.platforms);
  return (
    <article
      ref={setRef}
      className={"wire-row" + (active ? " is-active" : "") + (story.surfaced ? " is-spiked" : "")}
      data-tier={tier}
      onMouseEnter={onFocus}
      onClick={() => assign(story)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); assign(story); }
      }}
    >
      <div className="wire-row__rail">
        <span className="wire-row__rank">{String(rank).padStart(2, "0")}</span>
        <ScoreStamp score={story.interest_score} tier={tier} />
        <BuzzMeter count={story.buzz_count} peak={peakBuzz} compact />
      </div>

      <div className="wire-row__body">
        <h3 className="wire-row__headline">{story.summary}</h3>
        {story.react_angle && (
          <p className="wire-row__angle">
            <span className="wire-row__angletab">Angle</span>
            {story.react_angle}
          </p>
        )}
        <div className="wire-row__meta">
          {platforms.map((p) => <SourceStamp key={p} platform={p} />)}
          <span className="wire-row__buzztext">{story.buzz_count ?? 0} {story.buzz_count === 1 ? "post" : "posts"} buzzing</span>
        </div>
      </div>

      <div className="wire-row__actions" onClick={(e) => e.stopPropagation()}>
        <button
          className={"wire-btn wire-btn--assign wire-btn--sm" + (copied ? " is-done" : "")}
          onClick={() => assign(story)}
          title="Copy prompt for Claude Code"
        >
          {copied ? <CheckIcon /> : <AssignIcon />}
          <span>{copied ? "Copied" : "Copy prompt"}</span>
        </button>
        {story.top_url && (
          <button className="wire-btn wire-btn--icon" onClick={() => openSource(story)} title="Open source">
            <SourceIcon />
          </button>
        )}
        {story.surfaced ? (
          <button className="wire-btn wire-btn--icon" onClick={() => restore(story.id)} title="Restore to wire" disabled={pending}>
            <RestoreIcon />
          </button>
        ) : (
          <button className="wire-btn wire-btn--icon" onClick={() => spike(story.id)} title="Spike" disabled={pending}>
            <SpikeIcon />
          </button>
        )}
      </div>
    </article>
  );
}

function ScoreStamp({ score, tier, lead }: { score: number | null; tier: string; lead?: boolean }) {
  const pct = Math.max(0, Math.min(100, score ?? 0));
  const r = lead ? 30 : 22;
  const circ = 2 * Math.PI * r;
  const size = lead ? 72 : 54;
  return (
    <div className={"score-stamp score-stamp--" + tier + (lead ? " score-stamp--lead" : "")}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} className="score-stamp__track" fill="none" strokeWidth={lead ? 3 : 2.5} />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          className="score-stamp__arc" fill="none" strokeWidth={lead ? 3 : 2.5}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ - (pct / 100) * circ}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="score-stamp__inner">
        <span className="score-stamp__num">{score ?? "—"}</span>
        {lead && <span className="score-stamp__cap">interest</span>}
      </div>
    </div>
  );
}

function BuzzMeter({ count, peak, compact }: { count: number | null; peak: number; compact?: boolean }) {
  const n = count ?? 0;
  const bars = 5;
  const filled = Math.max(n > 0 ? 1 : 0, Math.round((n / peak) * bars));
  return (
    <div className={"buzz-meter" + (compact ? " buzz-meter--compact" : "")} title={`${n} posts buzzing`}>
      <div className="buzz-meter__bars">
        {Array.from({ length: bars }).map((_, i) => (
          <span key={i} className={"buzz-meter__bar" + (i < filled ? " is-on" : "")} />
        ))}
      </div>
      {!compact && <span className="buzz-meter__label">buzz</span>}
    </div>
  );
}

function SourceStamp({ platform }: { platform: string }) {
  return <span className={"source-stamp source-stamp--" + platform.toLowerCase()}>{platform}</span>;
}

function Key({ children }: { children: React.ReactNode }) {
  return <kbd className="wire-key">{children}</kbd>;
}

function Toast({ text }: { text: string | null }) {
  return (
    <div className={"toast" + (text ? " show" : "")}>
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M2.5 7 L5.5 10 L11.5 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>{text ?? ""}</span>
    </div>
  );
}

/* icons */
function AssignIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
      <path d="M2 11.5 L2 9.5 L9 2.5 L11.5 5 L4.5 12 L2.5 12" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M8 3.5 L10.5 6" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 12 12" fill="none">
      <path d="M2.5 6 L5 8.5 L9.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function SourceIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
      <path d="M6 3 H3 V11 H11 V8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 2.5 H11.5 V6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11 3 L6.5 7.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
function SpikeIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
      <path d="M3.5 3.5 L10.5 10.5 M10.5 3.5 L3.5 10.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
function RestoreIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
      <path d="M3 7 A4 4 0 1 0 5 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="none" />
      <path d="M3 2 V4 H5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
