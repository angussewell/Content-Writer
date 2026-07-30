"use client";

import { useMemo, useState, type CSSProperties } from "react";
import type { TikTokCurvePoint, TikTokDetail, TikTokRetentionSegment } from "./page";

type RetentionStyle = CSSProperties & { "--retention-color"?: string };

function firstUsefulLine(value: string | null) {
  if (!value) return "";
  return value.split("\n").map((line) => line.trim()).find(Boolean) ?? "";
}

function titleFor(video: TikTokDetail, segments: TikTokRetentionSegment[]) {
  return segments.find((segment) => segment.spoken)?.spoken
    || firstUsefulLine(video.transcript)
    || firstUsefulLine(video.caption)
    || `TikTok #${video.id}`;
}

function fmtDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value))
    : "—";
}

function num(value: number | null) {
  return value == null ? "—" : value.toLocaleString();
}

function asNumber(value: string | number | null) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function pct(value: number | null, digits = 1) {
  return value == null ? "—" : `${(value * 100).toFixed(digits)}%`;
}

function countRate(count: number | null, views: number | null) {
  return count == null || !views ? null : count / views;
}

function duration(value: number | null) {
  if (value == null) return "—";
  return `${(value / 1000).toFixed(value >= 60_000 ? 0 : 1)}s`;
}

function timeRange(start: number, end: number) {
  return `${Math.round(start)}–${Math.round(end)}s`;
}

function segmentStyle(dropPoints: number | null): RetentionStyle | undefined {
  if (dropPoints == null) return undefined;
  const severity = Math.min(Math.max(dropPoints / 16, 0), 1);
  const badMix = Math.round(severity * 100);
  return {
    "--retention-color": `color-mix(in oklab, var(--retention-good) ${100 - badMix}%, var(--retention-bad) ${badMix}%)`,
  };
}

function dropLabel(dropPoints: number | null) {
  if (dropPoints == null) return "No curve";
  if (dropPoints < 0.25) return "Held";
  return `−${dropPoints.toFixed(1)} pts`;
}

function RetentionChart({ curve, active }: { curve: TikTokCurvePoint[]; active: TikTokRetentionSegment | null }) {
  const points = curve
    .map((point) => ({ t: Number(point.second), pct: Number(point.retained_fraction) * 100 }))
    .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.pct));
  if (points.length === 0) return null;

  const width = 880;
  const height = 260;
  const pad = { top: 18, right: 18, bottom: 34, left: 44 };
  const maxTime = Math.max(...points.map((point) => point.t), 1);
  const x = (second: number) => pad.left + (second / maxTime) * (width - pad.left - pad.right);
  const y = (percent: number) => pad.top + ((100 - percent) / 100) * (height - pad.top - pad.bottom);
  const line = points.map((point) => `${x(point.t).toFixed(1)},${y(point.pct).toFixed(1)}`).join(" ");
  const area = `${pad.left},${height - pad.bottom} ${line} ${x(maxTime)},${height - pad.bottom}`;
  const horizontalTicks = [100, 75, 50, 25, 0];
  const timeTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => Math.round(maxTime * ratio));

  return (
    <div className="tt-chartwrap">
      <svg className="tt-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="TikTok audience retention over time">
        {horizontalTicks.map((tick) => (
          <g key={tick}>
            <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} className="tt-chart__grid" />
            <text x={4} y={y(tick) + 4} className="tt-chart__axis">{tick}%</text>
          </g>
        ))}
        {timeTicks.map((tick) => (
          <text key={tick} x={x(tick)} y={height - 8} textAnchor="middle" className="tt-chart__axis">{tick}s</text>
        ))}
        {active && (
          <rect
            x={x(active.start_s)}
            y={pad.top}
            width={Math.max(x(active.end_s) - x(active.start_s), 3)}
            height={height - pad.top - pad.bottom}
            className="tt-chart__focus"
          />
        )}
        <polygon points={area} className="tt-chart__area" />
        <polyline points={line} className="tt-chart__line" />
      </svg>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="tt-stat">
      <span className="tt-stat__label">{label}</span>
      <span className="tt-stat__value">{value}</span>
      {note && <span className="tt-stat__note">{note}</span>}
    </div>
  );
}

export function TiktokDetailClient({
  video,
  retentionSegments,
}: {
  video: TikTokDetail;
  retentionSegments: TikTokRetentionSegment[];
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const curve = useMemo(() => Array.isArray(video.retention_curve) ? video.retention_curve : [], [video.retention_curve]);
  const activeSegment = activeIndex == null ? null : retentionSegments[activeIndex] ?? null;
  const hasScoredSegments = retentionSegments.some((segment) => segment.drop_pts != null);

  const insights = useMemo(() => {
    const scored = retentionSegments.filter((segment) => segment.drop_pts != null);
    const steepest = scored.reduce<TikTokRetentionSegment | null>((worst, segment) => {
      if (!worst || (segment.drop_pts ?? 0) > (worst.drop_pts ?? 0)) return segment;
      return worst;
    }, null);
    const normalizedCurve = curve
      .map((point) => ({ second: Number(point.second), retained: Number(point.retained_fraction) }))
      .filter((point) => Number.isFinite(point.second) && Number.isFinite(point.retained));
    const atThree = normalizedCurve.reduce<{ second: number; retained: number } | null>((closest, point) => {
      if (!closest || Math.abs(point.second - 3) < Math.abs(closest.second - 3)) return point;
      return closest;
    }, null);
    const last = normalizedCurve[normalizedCurve.length - 1] ?? null;
    return { steepest, atThree, last };
  }, [curve, retentionSegments]);

  return (
    <div className="tt-detail">
      <header className="tt-detail__head">
        <div className="tt-detail__topline">
          <div className="pagehead__eyebrow">TikTok #{video.id}</div>
          {video.permalink && (
            <a className="tt-open" href={video.permalink} target="_blank" rel="noreferrer">
              Open on TikTok
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M6 3 H3 V13 H13 V10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                <path d="M9 3 H13 V7 M13 3 L7 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          )}
        </div>
        <h1 className="tt-detail__title">{titleFor(video, retentionSegments)}</h1>
        <div className="tt-detail__meta">
          <span>{fmtDate(video.create_time)}</span>
          <span className="m-dot">·</span>
          <span>{duration(video.duration_ms ?? video.source_duration_ms)}</span>
          <span className="m-dot">·</span>
          <span className={`tt-status${hasScoredSegments ? " tt-status--ready" : ""}`}>
            <span className="tt-status__dot" />
            {hasScoredSegments ? "Retention mapped" : "Script analyzed"}
          </span>
        </div>
      </header>

      <section className="tt-metrics" aria-label="TikTok performance metrics">
        <Stat label="Views" value={num(video.views)} />
        <Stat label="Avg watch" value={asNumber(video.avg_watch_time) == null ? "—" : `${asNumber(video.avg_watch_time)!.toFixed(1)}s`} note={`${video.duration_ms ? ((asNumber(video.avg_watch_time) ?? 0) / (video.duration_ms / 1000) * 100).toFixed(0) : "—"}% of video`} />
        <Stat label="Finished" value={pct(asNumber(video.finish_rate))} />
        <Stat label="Saves" value={num(video.saves)} note={`${pct(countRate(video.saves, video.views))} of views`} />
        <Stat label="Shares" value={num(video.shares)} note={`${pct(countRate(video.shares, video.views))} of views`} />
        <Stat label="Follows" value={num(video.follows_generated)} />
        <Stat label="Likes" value={num(video.likes)} note={`${pct(countRate(video.likes, video.views))} of views`} />
        <Stat label="Comments" value={num(video.comments)} note={`${pct(countRate(video.comments, video.views))} of views`} />
      </section>

      <section className="tt-retention">
        <div className="tt-retention__head">
          <div>
            <div className="pagehead__eyebrow">Attention map</div>
            <h2 className="tt-retention__title">Read the script like a retention curve</h2>
            <p className="tt-retention__sub">Each passage is aligned to what was spoken and shown during that moment. Color reflects the audience lost inside the passage.</p>
          </div>
          {hasScoredSegments && (
            <div className="tt-legend" aria-label="Retention color scale">
              <span>Held attention</span>
              <span className="tt-legend__scale" />
              <span>Sharp drop</span>
            </div>
          )}
        </div>

        {curve.length > 0 ? (
          <RetentionChart curve={curve} active={activeSegment} />
        ) : (
          <div className="tt-missing">This video has a script analysis, but TikTok did not return a retention curve.</div>
        )}

        {curve.length > 0 && (
          <div className="tt-insights">
            <div className="tt-insight">
              <span className="tt-insight__label">Hook · 3s</span>
              <strong>{insights.atThree ? `${(insights.atThree.retained * 100).toFixed(0)}% retained` : "—"}</strong>
            </div>
            <div className="tt-insight tt-insight--wide">
              <span className="tt-insight__label">Steepest passage</span>
              <strong>{insights.steepest ? `${dropLabel(insights.steepest.drop_pts)} · “${insights.steepest.spoken ?? insights.steepest.on_screen}”` : "—"}</strong>
            </div>
            <div className="tt-insight">
              <span className="tt-insight__label">End retention</span>
              <strong>{insights.last ? `${(insights.last.retained * 100).toFixed(0)}%` : "—"}</strong>
            </div>
          </div>
        )}

        <div className="tt-scripthead">
          <h3>Script timeline</h3>
          <p>{retentionSegments.length} passages · select one to locate it on the curve</p>
        </div>

        {retentionSegments.length > 0 ? (
          <div className="tt-script">
            {retentionSegments.map((segment, index) => (
              <button
                type="button"
                key={`${segment.start_s}-${index}`}
                className={`tt-segment${segment.drop_pts == null ? " tt-segment--unscored" : ""}${activeIndex === index ? " tt-segment--active" : ""}`}
                style={segmentStyle(segment.drop_pts)}
                onMouseEnter={() => setActiveIndex(index)}
                onFocus={() => setActiveIndex(index)}
                onClick={() => setActiveIndex(index)}
                aria-pressed={activeIndex === index}
                aria-label={`${timeRange(segment.start_s, segment.end_s)}, ${dropLabel(segment.drop_pts)}: ${segment.spoken ?? segment.on_screen}`}
              >
                <span className="tt-segment__marker" aria-hidden="true" />
                <span className="tt-segment__time">
                  <strong>{timeRange(segment.start_s, segment.end_s)}</strong>
                  <span>{dropLabel(segment.drop_pts)}</span>
                  {segment.retained_end != null && <small>{segment.retained_end.toFixed(0)}% remain</small>}
                </span>
                <span className="tt-segment__spoken">
                  <span className="tt-segment__label">Spoken</span>
                  <strong>{segment.spoken || "No spoken words"}</strong>
                </span>
                <span className="tt-segment__visual">
                  <span className="tt-segment__label">On screen</span>
                  <span>{segment.on_screen || "No visual description"}</span>
                </span>
              </button>
            ))}
          </div>
        ) : video.transcript ? (
          <div className="tt-transcriptfallback">
            <div className="tt-missing">Timing data is not available for this transcript yet.</div>
            <p>{video.transcript}</p>
          </div>
        ) : (
          <div className="tt-missing">The transcript analysis for this TikTok is still pending.</div>
        )}
      </section>

      {(video.caption || video.visual_description) && (
        <section className="tt-context">
          {video.caption && (
            <div>
              <span className="tt-context__label">TikTok caption</span>
              <p>{video.caption}</p>
            </div>
          )}
          {video.visual_description && (
            <div>
              <span className="tt-context__label">Visual summary</span>
              <p>{video.visual_description}</p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
