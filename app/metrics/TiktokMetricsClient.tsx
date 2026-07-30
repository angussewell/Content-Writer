"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { TiktokRow } from "./page";

type SortKey = "date" | "views" | "watch" | "finish" | "saves" | "shares";

function fmtDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "2-digit" }).format(new Date(value));
}

function num(value: number | null) {
  return value == null ? "—" : value.toLocaleString();
}

function compactNum(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 10_000) return `${(value / 1_000).toFixed(0)}k`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toLocaleString();
}

function asNumber(value: string | number | null) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function pct(value: number | null, digits = 1) {
  return value == null ? "—" : `${(value * 100).toFixed(digits)}%`;
}

function rate(count: number | null, views: number | null) {
  return count == null || !views ? null : count / views;
}

function cleanCaption(value: string | null) {
  if (!value) return "";
  return value.split(/\s+#/)[0].trim();
}

export function tiktokLabel(row: TiktokRow) {
  const spoken = row.spoken_hook?.trim();
  if (spoken) return spoken;
  const caption = cleanCaption(row.caption);
  return caption || `TikTok #${row.id}`;
}

const compareNullable = (a: number | null, b: number | null, direction: 1 | -1) => {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return (a - b) * direction;
};

export function TiktokMetricsClient({ rows, loadFailed }: { rows: TiktokRow[]; loadFailed: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [curveOnly, setCurveOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDirection, setSortDirection] = useState<1 | -1>(-1);

  const setSort = useCallback((next: SortKey) => {
    setSortKey((current) => {
      if (current === next) {
        setSortDirection((direction) => direction === 1 ? -1 : 1);
        return current;
      }
      setSortDirection(-1);
      return next;
    });
  }, []);

  const view = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows
      .filter((row) => {
        if (curveOnly && !row.has_curve) return false;
        if (!needle) return true;
        return `${tiktokLabel(row)} ${row.caption ?? ""}`.toLowerCase().includes(needle);
      })
      .sort((a, b) => {
        const direction = sortDirection;
        switch (sortKey) {
          case "views": return compareNullable(a.views, b.views, direction);
          case "watch": return compareNullable(asNumber(a.avg_watch_time), asNumber(b.avg_watch_time), direction);
          case "finish": return compareNullable(asNumber(a.finish_rate), asNumber(b.finish_rate), direction);
          case "saves": return compareNullable(rate(a.saves, a.views), rate(b.saves, b.views), direction);
          case "shares": return compareNullable(rate(a.shares, a.views), rate(b.shares, b.views), direction);
          case "date":
          default:
            return compareNullable(
              a.create_time ? new Date(a.create_time).getTime() : null,
              b.create_time ? new Date(b.create_time).getTime() : null,
              direction,
            );
        }
      });
  }, [rows, query, curveOnly, sortKey, sortDirection]);

  const summary = useMemo(() => {
    const views = rows.reduce((total, row) => total + (row.views ?? 0), 0);
    const saves = rows.reduce((total, row) => total + (row.saves ?? 0), 0);
    const shares = rows.reduce((total, row) => total + (row.shares ?? 0), 0);
    return {
      views,
      saveRate: views ? saves / views : null,
      shareRate: views ? shares / views : null,
    };
  }, [rows]);

  const sortHeader = (column: SortKey, label: string) => (
    <th className={`m-th m-th--right m-th--sortable${sortKey === column ? " m-th--active" : ""}`} onClick={() => setSort(column)}>
      <span className="m-th__inner">
        {label}
        {sortKey === column && <span className="m-sort__arrow">{sortDirection === 1 ? "↑" : "↓"}</span>}
      </span>
    </th>
  );

  return (
    <div className="m-wrap tt-list">
      <div className="m-summary">
        <div className="m-summary__cell">
          <span className="m-summary__num">{rows.length.toLocaleString()}</span>
          <span className="m-summary__label">Videos</span>
        </div>
        <div className="m-summary__cell">
          <span className="m-summary__num">{compactNum(summary.views)}</span>
          <span className="m-summary__label">Total views</span>
        </div>
        <div className="m-summary__cell">
          <span className="m-summary__num">{pct(summary.saveRate)}</span>
          <span className="m-summary__label">Save rate</span>
        </div>
        <div className="m-summary__cell">
          <span className="m-summary__num">{pct(summary.shareRate)}</span>
          <span className="m-summary__label">Share rate</span>
        </div>
      </div>

      <div className="m-controls">
        <label className="m-search">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.4" />
            <path d="M11 11 L14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <input value={query} onChange={(event) => setQuery(event.target.value)} type="search" placeholder="Search spoken hooks or captions…" />
        </label>
        <span className="filterrow__spacer" />
        <button className={`chip${curveOnly ? " chip--on" : ""}`} onClick={() => setCurveOnly((value) => !value)}>
          <span className="chip__dot" /> Retention ready
        </button>
      </div>

      <div className="m-tablewrap tt-tablewrap">
        <table className="m-table tt-table">
          <thead>
            <tr>
              <th className="m-th">Video</th>
              {sortHeader("date", "Date")}
              {sortHeader("views", "Views")}
              {sortHeader("watch", "Avg watch")}
              {sortHeader("finish", "Finished")}
              {sortHeader("saves", "Saves")}
              {sortHeader("shares", "Shares")}
              <th className="m-th m-th--right">Analysis</th>
            </tr>
          </thead>
          <tbody>
            {loadFailed ? (
              <tr><td colSpan={8} className="m-empty">TikTok metrics could not be loaded. Refresh to try again.</td></tr>
            ) : view.length === 0 ? (
              <tr><td colSpan={8} className="m-empty">No TikToks match this view.</td></tr>
            ) : view.map((row) => {
              const href = `/metrics/tiktok/${row.id}`;
              return (
                <tr
                  key={row.id}
                  className="m-row tt-row"
                  tabIndex={0}
                  onClick={(event) => {
                    if ((event.target as HTMLElement).closest("a,button,input")) return;
                    router.push(href);
                  }}
                  onKeyDown={(event) => { if (event.key === "Enter") router.push(href); }}
                >
                  <td className="m-cell m-cell--label tt-cell--video" data-label="Video">
                    <Link href={href} className="m-label tt-label">
                      <span className="m-label__text">{tiktokLabel(row)}</span>
                    </Link>
                    <span className="tt-caption">{cleanCaption(row.caption)}</span>
                    {row.permalink && (
                      <a className="m-extlink" href={row.permalink} target="_blank" rel="noreferrer" title="Open on TikTok" onClick={(event) => event.stopPropagation()}>
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                          <path d="M6 3 H3 V13 H13 V10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                          <path d="M9 3 H13 V7 M13 3 L7 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </a>
                    )}
                  </td>
                  <td className="m-cell m-cell--num m-cell--muted" data-label="Date">{fmtDate(row.create_time)}</td>
                  <td className="m-cell m-cell--num" data-label="Views">{num(row.views)}</td>
                  <td className="m-cell m-cell--num" data-label="Avg watch">{asNumber(row.avg_watch_time) == null ? "—" : `${asNumber(row.avg_watch_time)!.toFixed(1)}s`}</td>
                  <td className="m-cell m-cell--num" data-label="Finished">{pct(asNumber(row.finish_rate))}</td>
                  <td className="m-cell m-cell--num" data-label="Saves">
                    <span className="tt-ratepair"><span>{num(row.saves)}</span><small>{pct(rate(row.saves, row.views))}</small></span>
                  </td>
                  <td className="m-cell m-cell--num" data-label="Shares">
                    <span className="tt-ratepair"><span>{num(row.shares)}</span><small>{pct(rate(row.shares, row.views))}</small></span>
                  </td>
                  <td className="m-cell m-cell--num" data-label="Analysis">
                    <span className={`tt-status${row.has_curve && row.has_analysis ? " tt-status--ready" : ""}`}>
                      <span className="tt-status__dot" />
                      {row.has_curve && row.has_analysis ? "Mapped" : row.has_analysis ? "Script only" : "Pending"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="m-footnote">{view.length} of {rows.length} shown · select any video to inspect its retention</div>
    </div>
  );
}
