"use client";

import { useState, useMemo, useCallback, useTransition } from "react";
import Link from "next/link";
import type { ReelRow } from "./page";
import { updateMetricField } from "@/app/actions";
import { buildRepurposeBlob } from "@/lib/repurpose";

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(d));
}

function firstLine(s: string | null): string {
  if (!s) return "";
  const line = s.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  // strip a leading [On-screen text: …] directive if that's all that leads
  return line.replace(/^\[[^\]]*\]\s*/, "").trim() || line.trim();
}

export function reelLabel(r: ReelRow): string {
  if (r.title_hook && r.title_hook.trim()) return r.title_hook.trim();
  const fromTranscript = firstLine(r.transcript_head);
  if (fromTranscript) return fromTranscript;
  const fromCaption = firstLine(r.caption);
  if (fromCaption) return fromCaption;
  return `Reel #${r.id}`;
}

function num(n: number | null): string {
  return n == null ? "—" : n.toLocaleString();
}

function watchSecs(ms: number | null): string {
  return ms == null ? "—" : `${(ms / 1000).toFixed(1)}s`;
}

function skipPct(s: string | null): string {
  if (s == null || s === "") return "—";
  const v = parseFloat(s);
  return Number.isFinite(v) ? `${v.toFixed(0)}%` : "—";
}

type SortKey =
  | "date" | "label" | "reach" | "follows" | "skip" | "watch" | "saves" | "shares";
type TriFilter = "all" | "yes" | "no";

const cmp = (a: number | null, b: number | null, dir: 1 | -1) => {
  if (a == null && b == null) return 0;
  if (a == null) return 1; // nulls always last
  if (b == null) return -1;
  return (a - b) * dir;
};

function compactNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(0)}k`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

export function MetricsClient({ rows }: { rows: ReelRow[] }) {
  const [q, setQ] = useState("");
  const [trial, setTrial] = useState<TriFilter>("all");
  const [curve, setCurve] = useState<TriFilter>("all");
  const [repurposed, setRepurposed] = useState<TriFilter>("all");
  const [needsRewrite, setNeedsRewrite] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  // optimistic overrides for inline-edited follows
  const [followEdits, setFollowEdits] = useState<Record<number, number | null>>({});
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const copyRepurpose = useCallback(async (r: ReelRow) => {
    const blob = buildRepurposeBlob({ id: r.id, title: reelLabel(r), permalink: r.permalink });
    try { await navigator.clipboard.writeText(blob); } catch { /* ignore */ }
    setCopiedId(r.id);
    setTimeout(() => setCopiedId((c) => (c === r.id ? null : c)), 1600);
    setToast("Copied — paste into plan-post reel-repurpose");
    setTimeout(() => setToast(null), 1800);
  }, []);

  const followOf = useCallback(
    (r: ReelRow) => (r.id in followEdits ? followEdits[r.id] : r.follows_generated),
    [followEdits]
  );

  const saveFollows = useCallback((id: number, raw: string) => {
    const trimmed = raw.trim();
    const value = trimmed === "" ? null : parseInt(trimmed, 10);
    setFollowEdits((p) => ({ ...p, [id]: Number.isFinite(value as number) ? (value as number) : null }));
    startTransition(async () => {
      await updateMetricField(id, "follows_generated", trimmed === "" ? null : trimmed);
    });
  }, []);

  const setSort = useCallback((key: SortKey) => {
    setSortKey((prevKey) => {
      if (prevKey === key) {
        setSortDir((d) => (d === 1 ? -1 : 1));
        return key;
      }
      // sensible default direction per column
      setSortDir(key === "label" ? 1 : -1);
      return key;
    });
  }, []);

  const view = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = rows.filter((r) => {
      if (trial === "yes" && !r.is_trial_reel) return false;
      if (trial === "no" && r.is_trial_reel) return false;
      if (curve === "yes" && !r.has_curve) return false;
      if (curve === "no" && r.has_curve) return false;
      if (repurposed === "yes" && !r.repurposed) return false;
      if (repurposed === "no" && r.repurposed) return false;
      if (needsRewrite && r.pending_rewrites <= 0) return false;
      if (needle && !reelLabel(r).toLowerCase().includes(needle)) return false;
      return true;
    });
    const dir = sortDir;
    out = [...out].sort((a, b) => {
      switch (sortKey) {
        case "label": return reelLabel(a).localeCompare(reelLabel(b)) * dir;
        case "reach": return cmp(a.reach, b.reach, dir);
        case "follows": return cmp(followOf(a), followOf(b), dir);
        case "skip": return cmp(a.skip_rate ? parseFloat(a.skip_rate) : null, b.skip_rate ? parseFloat(b.skip_rate) : null, dir);
        case "watch": return cmp(a.avg_watch_time, b.avg_watch_time, dir);
        case "saves": return cmp(a.saves, b.saves, dir);
        case "shares": return cmp(a.shares, b.shares, dir);
        case "date":
        default: return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir;
      }
    });
    return out;
  }, [rows, q, trial, curve, repurposed, needsRewrite, sortKey, sortDir, followOf]);

  const summary = useMemo(() => {
    const sum = (pick: (r: ReelRow) => number | null) =>
      rows.reduce((acc, r) => acc + (pick(r) ?? 0), 0);
    const skips = rows.map((r) => (r.skip_rate ? parseFloat(r.skip_rate) : NaN)).filter((n) => Number.isFinite(n));
    const medianSkip = skips.length
      ? [...skips].sort((a, b) => a - b)[Math.floor(skips.length / 2)]
      : null;
    return {
      count: rows.length,
      reach: sum((r) => r.reach),
      follows: rows.reduce((acc, r) => acc + (followOf(r) ?? 0), 0),
      medianSkip,
    };
  }, [rows, followOf]);

  const triLabel = (f: TriFilter, on: string, off: string) =>
    f === "yes" ? on : f === "no" ? off : `${on} / ${off}`;
  const cycleTri = (cur: TriFilter): TriFilter =>
    cur === "all" ? "yes" : cur === "yes" ? "no" : "all";

  const Arrow = ({ k }: { k: SortKey }) =>
    sortKey === k ? <span className="m-sort__arrow">{sortDir === 1 ? "↑" : "↓"}</span> : null;

  const Th = ({ k, children, align }: { k: SortKey; children: React.ReactNode; align?: "right" }) => (
    <th
      className={"m-th m-th--sortable" + (align === "right" ? " m-th--right" : "") + (sortKey === k ? " m-th--active" : "")}
      onClick={() => setSort(k)}
    >
      <span className="m-th__inner">{children}<Arrow k={k} /></span>
    </th>
  );

  return (
    <div className="m-wrap">
      {toast && <div className="m-toast">{toast}</div>}

      {/* Summary strip */}
      <div className="m-summary">
        <div className="m-summary__cell">
          <span className="m-summary__num">{summary.count.toLocaleString()}</span>
          <span className="m-summary__label">Reels</span>
        </div>
        <div className="m-summary__cell">
          <span className="m-summary__num">{compactNum(summary.reach)}</span>
          <span className="m-summary__label">Total reach</span>
        </div>
        <div className="m-summary__cell">
          <span className="m-summary__num">{compactNum(summary.follows)}</span>
          <span className="m-summary__label">Follows generated</span>
        </div>
        <div className="m-summary__cell">
          <span className="m-summary__num">{summary.medianSkip == null ? "—" : `${summary.medianSkip.toFixed(0)}%`}</span>
          <span className="m-summary__label">Median skip</span>
        </div>
      </div>

      {/* Controls */}
      <div className="m-controls">
        <div className="m-search">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.4" />
            <path d="M11 11 L14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by title hook…"
          />
        </div>

        <span className="filterrow__spacer" />

        <button
          className={"chip " + (trial !== "all" ? "chip--on" : "")}
          onClick={() => setTrial(cycleTri)}
        >
          <span className="chip__dot" /> {trial === "all" ? "Trial reel" : triLabel(trial, "Trial only", "Non-trial")}
        </button>
        <button
          className={"chip " + (curve !== "all" ? "chip--on" : "")}
          onClick={() => setCurve(cycleTri)}
        >
          <span className="chip__dot" /> {curve === "all" ? "Curve" : triLabel(curve, "Has curve", "No curve")}
        </button>
        <button
          className={"chip " + (repurposed !== "all" ? "chip--on" : "")}
          onClick={() => setRepurposed(cycleTri)}
        >
          <span className="chip__dot" /> {repurposed === "all" ? "Repurposed" : triLabel(repurposed, "Repurposed", "Not repurposed")}
        </button>
        <button
          className={"chip " + (needsRewrite ? "chip--on" : "")}
          onClick={() => setNeedsRewrite((v) => !v)}
        >
          <span className="chip__dot" /> Needs rewrite
        </button>
      </div>

      {/* Table */}
      <div className="m-tablewrap">
        <table className="m-table">
          <thead>
            <tr>
              <Th k="label">Title hook</Th>
              <Th k="date" align="right">Date</Th>
              <Th k="reach" align="right">Reach</Th>
              <th className="m-th m-th--right m-th--follows">Follows</th>
              <Th k="skip" align="right">Skip</Th>
              <Th k="watch" align="right">Watch</Th>
              <Th k="saves" align="right">Saves</Th>
              <Th k="shares" align="right">Shares</Th>
              <th className="m-th m-th--right" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {view.length === 0 ? (
              <tr><td colSpan={9} className="m-empty">No reels match these filters.</td></tr>
            ) : view.map((r) => (
              <tr key={r.id} className="m-row">
                <td className="m-cell m-cell--label">
                  <Link href={`/metrics/${r.id}`} className="m-label">
                    {r.is_trial_reel && <span className="m-tag m-tag--trial" title="Trial reel">T</span>}
                    {r.repurposed && (
                      <span className="m-tag m-tag--repurposed" title="Already repurposed into a Substack post">↗ Substack</span>
                    )}
                    {r.pending_rewrites > 0 && (
                      <span className="m-tag m-tag--rewrite" title={`${r.pending_rewrites} pending rewrite${r.pending_rewrites === 1 ? "" : "s"}`}>
                        ✎ {r.pending_rewrites}
                      </span>
                    )}
                    <span className="m-label__text">{reelLabel(r)}</span>
                  </Link>
                  {r.permalink && (
                    <a className="m-extlink" href={r.permalink} target="_blank" rel="noreferrer" title="Open on Instagram" onClick={(e) => e.stopPropagation()}>
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                        <path d="M6 3 H3 V13 H13 V10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                        <path d="M9 3 H13 V7 M13 3 L7 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </a>
                  )}
                </td>
                <td className="m-cell m-cell--num m-cell--muted">{fmtDate(r.created_at)}</td>
                <td className="m-cell m-cell--num">{num(r.reach)}</td>
                <td className="m-cell m-cell--num m-cell--follows">
                  <input
                    className={"m-follows-input" + (followOf(r) == null ? " m-follows-input--empty" : "")}
                    type="number"
                    defaultValue={followOf(r) ?? ""}
                    placeholder="—"
                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                    onBlur={(e) => {
                      const cur = followOf(r);
                      const next = e.target.value.trim();
                      if ((next === "" ? null : parseInt(next, 10)) !== cur) saveFollows(r.id, next);
                    }}
                  />
                </td>
                <td className="m-cell m-cell--num">{skipPct(r.skip_rate)}</td>
                <td className="m-cell m-cell--num">{watchSecs(r.avg_watch_time)}</td>
                <td className="m-cell m-cell--num">{num(r.saves)}</td>
                <td className="m-cell m-cell--num">{num(r.shares)}</td>
                <td className="m-cell m-cell--actions">
                  <button
                    className={"m-copybtn" + (copiedId === r.id ? " m-copybtn--ok" : "")}
                    title="Copy reel for plan-post reel-repurpose"
                    onClick={() => copyRepurpose(r)}
                  >
                    {copiedId === r.id ? "Copied ✓" : "Repurpose"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="m-footnote">{view.length} of {rows.length} shown · click a row to open · click a header to sort</div>
    </div>
  );
}
