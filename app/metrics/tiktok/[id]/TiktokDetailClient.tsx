"use client";

import { useEffect, useRef, useState } from "react";
import type { TikTokDetail } from "./page";
import { RETENTION_SETTINGS, VERDICT_LABELS, type RetentionAnalysis, type TikTokRetentionSegment, type CumulativePoint, type TikTokCurvePoint } from "@/lib/tiktokRetention";

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
  return Number.isFinite(start) && Number.isFinite(end) ? `${start}–${end}s` : "Unknown timing";
}

function dropLabel(dropPoints: number | null) {
  return dropPoints == null ? "—" : `${dropPoints.toFixed(1)} pts`;
}

function qualityExplanation(quality: TikTokRetentionSegment["quality"]) {
  switch (quality) {
    case "missing": return "A boundary or intervening sample is missing. No loss is attributed outside the available curve.";
    case "malformed": return "The source curve or passage timestamps are invalid, so this passage is unscored.";
    case "rising": return "Retention rises within this passage. This data-quality state is not graded as held attention.";
    case "low-retention": return "Starting retention reaches zero under endpoint uncertainty, so the relative decline is suppressed.";
    case "short": return "This passage is shorter than the one-second sampling interval. There is insufficient resolution for a grade.";
    default: return "";
  }
}

function RetentionChart({ curve, cumulative, active }: { curve: TikTokCurvePoint[]; cumulative: CumulativePoint[]; active: TikTokRetentionSegment | null }) {
  const chartRef = useRef<SVGSVGElement>(null);
  const [{ width, height }, setSize] = useState({ width: 880, height: 260 });
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ width, height });
    });
    observer.observe(chart);
    return () => observer.disconnect();
  }, []);
  const points = curve
    .map((point) => ({ t: Number(point.second), pct: Number(point.retained_fraction) * 100 }))
    .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.pct));
  if (points.length === 0) return null;

  const pad = { top: 18, right: 18, bottom: 34, left: 44 };
  const maxTime = Math.max(...points.map((point) => point.t), 1);
  const x = (second: number) => pad.left + (second / maxTime) * (width - pad.left - pad.right);
  const y = (percent: number) => pad.top + ((100 - percent) / 100) * (height - pad.top - pad.bottom);
  const line = points.map((p, i) => `${i === 0 || p.t - points[i - 1].t > 1 ? "M" : "L"}${x(p.t)},${y(p.pct)}`).join(" ");
  const baseline = cumulative.map((p, i) => p.retained == null ? "" : `${i === 0 || cumulative[i - 1].retained == null || p.second - cumulative[i - 1].second > 1 ? "M" : "L"}${x(p.second)},${y(p.retained * 100)}`).join(" ");
  const horizontalTicks = [100, 75, 50, 25, 0];
  const timeTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => Math.round(maxTime * ratio));

  return (
    <div className="tt-chartwrap">
      <div className="tt-chartlegend"><span>This video</span><span>Typical total retention · dashed</span></div>
      <svg ref={chartRef} className="tt-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="TikTok retention and typical total retention over time; cumulative context, not passage grades">
        {horizontalTicks.map((tick) => (
          <g key={tick}>
            <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} className="tt-chart__grid" />
            <text x={4} y={y(tick) + 4} className="tt-chart__axis">{tick}%</text>
          </g>
        ))}
        {timeTicks.map((tick) => (
          <text key={tick} x={x(tick)} y={height - 8} textAnchor="middle" className="tt-chart__axis">{tick}s</text>
        ))}
        {active && Number.isFinite(active.start_s) && Number.isFinite(active.end_s) && active.start_s < maxTime && (
          <rect
            x={x(active.start_s)}
            y={pad.top}
            width={Math.max(x(Math.min(active.end_s, maxTime)) - x(active.start_s), 3)}
            height={height - pad.top - pad.bottom}
            className="tt-chart__focus"
          />
        )}
        <path d={baseline} className="tt-chart__baseline" />
        <path d={line} className="tt-chart__line" />
      </svg>
      <details className="tt-coverage">
        <summary>Comparison coverage by second</summary>
        <p>Gaps mean fewer than {RETENTION_SETTINGS.minimumPeers} videos cover that point. This curve shows total retention, separately from each passage’s relative decline.</p>
        <div className="tt-coverage__table"><table><thead><tr><th>Second</th><th>Typical total retention</th><th>Videos</th></tr></thead>
          <tbody>{cumulative.map((p) => <tr key={p.second}><td>{p.second}s</td><td>{pct(p.retained)}</td><td>{p.n}</td></tr>)}</tbody>
        </table></div>
      </details>
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
  analysis,
}: {
  video: TikTokDetail;
  analysis: RetentionAnalysis;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const { curve, segments: retentionSegments } = analysis;
  const activeSegment = activeIndex == null ? null : retentionSegments[activeIndex] ?? null;
  const hasScoredSegments = retentionSegments.some((segment) => segment.drop_pts != null);
  const steepest = analysis.steepestIndex == null ? null : retentionSegments[analysis.steepestIndex];
  const worst = analysis.worstIndex == null ? null : retentionSegments[analysis.worstIndex];
  const latestFetch = analysis.cohort.map((v) => v.fetched_at).filter((v): v is string => v != null)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];

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
            <p className="tt-retention__sub">See whether attention declined faster or slower than recent usual during each passage. Color appears only when the comparison clears the rounding check.</p>
          </div>
          {hasScoredSegments && (
            <div className="tt-legend" aria-label="Reliable passage comparisons">
              <span className="tt-legend__better">Better</span>
              <span>Usual / uncertain</span>
              <span className="tt-legend__worse">Worse</span>
            </div>
          )}
        </div>

        <div className="tt-benchmark">
          <div className="tt-benchmark__summary">
            <strong>{analysis.cohort.length} prior comparable videos</strong>
            <span>{analysis.cohort.length ? `${fmtDate(analysis.cohort[analysis.cohort.length - 1].create_time)} – ${fmtDate(analysis.cohort[0].create_time)}` : "No eligible comparison videos"}</span>
            {analysis.early && curve.length > 0 && <span className="tt-benchmark__early">Early data · descriptive comparison</span>}
          </div>
          {!analysis.comparisonAvailable && <p>Comparison unavailable: publication date, runtime or account identity is missing.</p>}
          {analysis.early && curve.length > 0 && <p>This curve was measured before day 7, below 1,000 views, or without measurement details. Passage results stay neutral.</p>}
          <details>
            <summary>How this comparison works</summary>
            <p>Newest {RETENTION_SETTINGS.cohortSize} eligible uploads from {analysis.account ? `@${analysis.account}` : "the same TikTok account"}, published strictly before this video within {RETENTION_SETTINGS.lookbackDays} days, with runtime within ±25%. Each curve must have been measured at least 7 days after publication with at least 1,000 views. All eligible performance levels count equally.</p>
            <p>Passages compare the same elapsed seconds. Passages overlapping the final 5 seconds align by time remaining, preserving their length; body comparisons exclude peers’ final 5 seconds. At least 10 usable comparisons are required per passage.</p>
            <p>Usual loss applies the median peer relative decline to this passage’s starting retention. The middle half of peer declines is the usual range. Stronger verdicts must survive ±1 retention point at every endpoint; this checks rounding sensitivity, not statistical confidence. Flat or indistinguishable ranges can be too close to call.</p>
            <p>One-second samples, rounded to whole retention points. Fractional boundaries use linear estimates between adjacent samples. Missing endpoints are never extended. A passage label describes timing, not proof that its words caused exits.</p>
            <p>Latest peer fetch: {fmtDate(latestFetch ?? null)}. Target measured: {fmtDate(video.fetched_at)}. These are the latest stored curves, which may have been fetched after this video was published.</p>
            <p>These thresholds are provisional defaults. Uploads count as videos, not independent experiments. No reliable paid-only or unique-cut labels are available.</p>
            <details><summary>View the {analysis.cohort.length} comparison videos</summary><ul className="tt-cohortlist">
              {analysis.cohort.map((v) => <li key={v.tiktok_id}><a href={`/metrics/tiktok/${v.id}`}>TikTok #{v.id}</a> · published {fmtDate(v.create_time)} · fetched {fmtDate(v.fetched_at)}</li>)}
            </ul></details>
          </details>
        </div>

        {curve.length > 0 ? (
          <RetentionChart curve={curve} cumulative={analysis.cumulative} active={activeSegment} />
        ) : (
          <div className="tt-missing">This video has a script analysis, but TikTok did not return a retention curve.</div>
        )}

        {curve.length > 0 && (
          <div className="tt-insights">
            <div className="tt-insight">
              <span className="tt-insight__label">Hook · 3s</span>
              <strong>{pct(analysis.hook.retained)} retained</strong>
              <span>{analysis.hook.retained != null && analysis.hook.typical != null ? `Typical total: ${pct(analysis.hook.typical)} · ${analysis.hook.n} videos` : "Comparison unavailable"}</span>
            </div>
            <div className="tt-insight tt-insight--wide">
              <span className="tt-insight__label">Largest raw passage loss</span>
              <strong>{steepest ? `${dropLabel(steepest.drop_pts)} · ${timeRange(steepest.start_s, steepest.end_s)}` : "—"}</strong>
              <span>{steepest?.spoken ?? steepest?.on_screen}</span>
            </div>
            <div className="tt-insight">
              <span className="tt-insight__label">End retention</span>
              <strong>{pct(analysis.end.retained)}</strong>
              <span>{analysis.end.retained == null ? `Exact end not sampled. Last sample: ${pct(curve[curve.length - 1].retained_fraction)} at ${curve[curve.length - 1].second}s.` : analysis.end.typical != null ? `Typical at ${analysis.end.second}s: ${pct(analysis.end.typical)} · ${analysis.end.n} videos` : "Insufficient reference coverage"}</span>
            </div>
            <div className="tt-insight tt-insight--worst">
              <span className="tt-insight__label">Worst reliable passage versus usual</span>
              <strong>{worst ? `${timeRange(worst.start_s, worst.end_s)} · ${dropLabel(worst.excess_loss)} excess loss` : "No clear underperforming passage"}</strong>
              <span>{worst ? `${worst.spoken ?? worst.on_screen} · Raw loss ${dropLabel(worst.drop_pts)} · Usual loss ${dropLabel(worst.usual_loss)} · ${worst.peer_count} comparisons` : analysis.early ? "Early data cannot identify a reliable worst passage." : "Only reliably worse-than-usual passages qualify."}</span>
            </div>
          </div>
        )}

        <div className="tt-scripthead">
          <h3>Script timeline</h3>
            <p>{retentionSegments.length} passages · {curve.length > 0 ? "select one to locate it on the curve" : "retention unavailable"}</p>
        </div>

        {retentionSegments.length > 0 ? (
          <div className="tt-script">
            {retentionSegments.map((segment, index) => (
              <div key={`${segment.start_s}-${index}`} className={`tt-passage tt-passage--${segment.verdict}`}>
              <button
                type="button"
                className={`tt-segment${activeIndex === index ? " tt-segment--active" : ""}`}
                onFocus={() => setActiveIndex(index)}
                onClick={() => setActiveIndex(index)}
                aria-pressed={activeIndex === index}
                aria-label={`${timeRange(segment.start_s, segment.end_s)}, ${VERDICT_LABELS[segment.verdict]}, raw loss ${dropLabel(segment.drop_pts)}, usual loss ${dropLabel(segment.usual_loss)}, ${segment.peer_count} comparisons: ${segment.spoken ?? segment.on_screen}`}
              >
                <span className="tt-segment__marker" aria-hidden="true" />
                <span className="tt-segment__time">
                  <strong>{timeRange(segment.start_s, segment.end_s)}</strong>
                  {segment.retained_end != null && <small>{segment.retained_end.toFixed(1)}% remain</small>}
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
              <div className="tt-passage__result">
                <strong className="tt-verdict">{VERDICT_LABELS[segment.verdict]}</strong>
                <span>Raw loss <b>{dropLabel(segment.drop_pts)}</b></span>
                <span>Usual loss <b>{dropLabel(segment.usual_loss)}</b></span>
                <span>{segment.peer_count} comparisons</span>
              </div>
              <details className="tt-passage__details">
                <summary>Passage details</summary>
                <p>Starting retention {segment.retained_start == null ? "unavailable" : `${segment.retained_start.toFixed(1)}%`} · Ending retention {segment.retained_end == null ? "unavailable" : `${segment.retained_end.toFixed(1)}%`} · Excess loss {dropLabel(segment.excess_loss)}.</p>
                <p>Relative curve decline {pct(segment.decline)} · Peer median {pct(segment.median)} · Usual range {pct(segment.q25)} to {pct(segment.q75)}.</p>
                <p>{segment.alignment === "ending" ? "Matched by seconds remaining until the end." : "Matched at the same elapsed seconds, outside peers’ final 5 seconds."} {segment.interpolated ? "Fractional boundaries are interpolated estimates from one-second samples." : "Boundaries use one-second samples."}</p>
                {segment.lower != null && <p>Endpoint rounding range for this decline: {pct(segment.lower)} to {pct(segment.upper)}. This is a sensitivity check, not a confidence interval.</p>}
                {segment.quality !== "ok" && <p>{qualityExplanation(segment.quality)}</p>}
                {segment.verdict === "sparse" && <p>Fewer than 10 usable peer spans. Date and runtime rules have not been broadened.</p>}
              </details>
              </div>
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
