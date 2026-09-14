// Shared source of truth for passage boundaries, local comparisons and cumulative context.
// These are product defaults, not calibrated statistical confidence thresholds.
export const RETENTION_SETTINGS = {
  cohortSize: 20, lookbackDays: 90, runtimeTolerance: 0.25,
  minimumAgeDays: 7, minimumViews: 1_000, minimumPeers: 10,
  endRegionSeconds: 5, sampleSeconds: 1, endpointUncertainty: 0.01,
} as const;

export type TikTokCurvePoint = { second: number; retained_fraction: number };
export type TikTokSourceSegment = { start_s: number; end_s: number; spoken: string | null; on_screen: string | null };
export type RetentionVideo = {
  id: number; tiktok_id: string; duration_ms: number | null; create_time: string | null;
  fetched_at: string | null; views: number | null; permalink: string | null; retention_curve: unknown;
};
type Quality = "ok" | "missing" | "malformed" | "rising" | "low-retention" | "short";
export type Verdict = "better" | "usual" | "worse" | "close" | "early" | "sparse" | "no-cohort" | Exclude<Quality, "ok">;
export const VERDICT_LABELS: Record<Verdict, string> = {
  better: "Better than usual", usual: "About usual", worse: "Worse than usual",
  close: "Too close to call", early: "Early data", sparse: "Insufficient comparisons",
  "no-cohort": "Comparison unavailable", missing: "Missing endpoint", malformed: "Invalid data",
  rising: "Curve rises", "low-retention": "Too little retention", short: "Insufficient resolution",
};
export type PassageMeasurement = {
  retained_start: number | null; retained_end: number | null; drop_pts: number | null;
  decline: number | null; lower: number | null; upper: number | null;
  quality: Quality; interpolated: boolean;
};
export type TikTokRetentionSegment = TikTokSourceSegment & PassageMeasurement & {
  verdict: Verdict; peer_count: number; usual_loss: number | null; excess_loss: number | null;
  q25: number | null; median: number | null; q75: number | null; alignment: "elapsed" | "ending";
};
export type CumulativePoint = { second: number; retained: number | null; n: number };
export type RetentionAnalysis = {
  curve: TikTokCurvePoint[]; segments: TikTokRetentionSegment[]; cumulative: CumulativePoint[];
  cohort: { id: number; tiktok_id: string; create_time: string | null; fetched_at: string | null }[];
  account: string | null; early: boolean; comparisonAvailable: boolean;
  hook: { retained: number | null; typical: number | null; n: number };
  end: { second: number; retained: number | null; typical: number | null; n: number };
  worstIndex: number | null; steepestIndex: number | null;
};

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const timestamp = (v: string | null) => v == null ? NaN : new Date(v).getTime();

export function accountFor(permalink: string | null): string | null {
  try {
    const url = new URL(permalink ?? "");
    return /^(www\.)?tiktok\.com$/i.test(url.hostname)
      ? url.pathname.match(/^\/@([^/]+)\/video\//)?.[1].toLowerCase() ?? null : null;
  } catch { return null; }
}

export function usableCurve(raw: unknown): TikTokCurvePoint[] | null {
  if (!Array.isArray(raw) || raw.length < 2) return null;
  for (let i = 0; i < raw.length; i++) {
    const p = raw[i];
    if (!p || !finite(p.second) || !Number.isInteger(p.second) || p.second < 0
      || !finite(p.retained_fraction) || p.retained_fraction < 0 || p.retained_fraction > 1
      || (i > 0 && p.second <= raw[i - 1].second)) return null;
  }
  return raw.some((p, i) => i > 0 && p.second - raw[i - 1].second === 1) ? raw : null;
}

// Interpolate only between adjacent one-second samples. Never fill holes or extrapolate.
export function retentionAt(curve: TikTokCurvePoint[], second: number): number | null {
  if (!finite(second) || second < 0) return null;
  const exact = curve.find((p) => p.second === second);
  if (exact) return exact.retained_fraction;
  const left = curve.find((p) => p.second === Math.floor(second));
  const right = curve.find((p) => p.second === Math.ceil(second));
  if (!left || !right || right.second - left.second !== RETENTION_SETTINGS.sampleSeconds) return null;
  return left.retained_fraction + (right.retained_fraction - left.retained_fraction) * (second - left.second);
}

export function measurePassage(raw: unknown, start: number, end: number): PassageMeasurement {
  const empty: PassageMeasurement = {
    retained_start: null, retained_end: null, drop_pts: null, decline: null,
    lower: null, upper: null, quality: "missing", interpolated: false,
  };
  if (!finite(start) || !finite(end) || start < 0 || end <= start) return { ...empty, quality: "malformed" };
  if (raw == null || (Array.isArray(raw) && !raw.length)) return empty;
  const curve = usableCurve(raw);
  if (!curve) return { ...empty, quality: "malformed" };
  const s = retentionAt(curve, start);
  const e = retentionAt(curve, end);
  const result = { ...empty, retained_start: s == null ? null : s * 100, retained_end: e == null ? null : e * 100,
    interpolated: !Number.isInteger(start) || !Number.isInteger(end) };
  if (s == null || e == null) return result;
  result.drop_pts = 100 * (s - e);
  // Check the whole span, including bracketing samples: a net decline can conceal a rise.
  const within = curve.filter((p) => p.second >= Math.floor(start) && p.second <= Math.ceil(end));
  if (within.some((p, i) => i > 0 && p.second - within[i - 1].second !== 1)) return result;
  if (within.some((p, i) => i > 0 && p.retained_fraction > within[i - 1].retained_fraction)) return { ...result, quality: "rising" };
  const u = RETENTION_SETTINGS.endpointUncertainty;
  if (s - u <= 0) return { ...result, quality: "low-retention" };
  if (end - start < RETENTION_SETTINGS.sampleSeconds) return { ...result, quality: "short" };
  return { ...result, quality: "ok", decline: 1 - e / s,
    // Endpoint rounding sensitivity, explicitly NOT a sampling confidence interval.
    lower: 1 - Math.min(1, e + u) / (s - u),
    upper: 1 - Math.max(0, e - u) / Math.min(1, s + u),
  };
}

export function quantile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const i = (sorted.length - 1) * p;
  return sorted[Math.floor(i)] + (sorted[Math.ceil(i)] - sorted[Math.floor(i)]) * (i % 1);
}

export function isMature(video: RetentionVideo): boolean {
  return timestamp(video.fetched_at) - timestamp(video.create_time) >= RETENTION_SETTINGS.minimumAgeDays * 86_400_000
    && finite(video.views) && video.views >= RETENTION_SETTINGS.minimumViews;
}

export function selectCohort(target: RetentionVideo, candidates: RetentionVideo[]): RetentionVideo[] {
  const account = accountFor(target.permalink);
  const published = timestamp(target.create_time);
  if (!account || !Number.isFinite(published) || !finite(target.duration_ms) || target.duration_ms <= 0) return [];
  const seen = new Set<string>();
  // Latest stored usable observation for each upload; equal fetches break ties by id.
  const latest = [...candidates].sort((a, b) =>
    (timestamp(b.fetched_at) || 0) - (timestamp(a.fetched_at) || 0) || b.id - a.id
  ).filter((video) => {
    if (!usableCurve(video.retention_curve) || seen.has(video.tiktok_id)) return false;
    seen.add(video.tiktok_id);
    return true;
  });
  return latest.filter((v) => v.id !== target.id && v.tiktok_id !== target.tiktok_id
    && accountFor(v.permalink) === account
    && timestamp(v.create_time) < published
    && timestamp(v.create_time) >= published - RETENTION_SETTINGS.lookbackDays * 86_400_000
    && finite(v.duration_ms) && Math.abs(v.duration_ms - target.duration_ms!) <= target.duration_ms! * RETENTION_SETTINGS.runtimeTolerance
    && isMature(v)
  ).sort((a, b) => timestamp(b.create_time) - timestamp(a.create_time) || b.id - a.id)
    .slice(0, RETENTION_SETTINGS.cohortSize);
}

export function matchedSpan(start: number, end: number, targetDuration: number, peerDuration: number) {
  if (!finite(targetDuration) || !finite(peerDuration) || start < 0 || end > targetDuration || end <= start) return null;
  if (end > targetDuration - RETENTION_SETTINGS.endRegionSeconds) {
    const s = peerDuration - (targetDuration - start);
    const e = s + (end - start);
    return s < 0 || e > peerDuration + 1e-9 ? null : { start: s, end: Math.min(e, peerDuration) };
  }
  return end > peerDuration - RETENTION_SETTINGS.endRegionSeconds ? null : { start, end };
}

export function comparePassage(target: RetentionVideo, segment: TikTokSourceSegment, cohort: RetentionVideo[]): TikTokRetentionSegment {
  const measurement = measurePassage(target.retention_curve, segment.start_s, segment.end_s);
  const duration = (target.duration_ms ?? 0) / 1_000;
  const peers = cohort.flatMap((v) => {
    const span = matchedSpan(segment.start_s, segment.end_s, duration, (v.duration_ms ?? 0) / 1_000);
    if (!span) return [];
    const m = measurePassage(v.retention_curve, span.start, span.end);
    return m.quality === "ok" ? [m] : [];
  });
  const q25 = quantile(peers.map((m) => m.decline!), .25);
  const median = quantile(peers.map((m) => m.decline!), .5);
  const q75 = quantile(peers.map((m) => m.decline!), .75);
  const enough = peers.length >= RETENTION_SETTINGS.minimumPeers;
  const usual = enough && measurement.quality === "ok" ? measurement.retained_start! * median! : null;
  let verdict: Verdict;
  if (measurement.quality !== "ok") verdict = measurement.quality;
  else if (!accountFor(target.permalink) || !Number.isFinite(timestamp(target.create_time)) || duration <= 0) verdict = "no-cohort";
  else if (!enough) verdict = "sparse";
  else if (!isMature(target)) verdict = "early";
  else if (measurement.upper! < quantile(peers.map((m) => m.lower!), .25)!) verdict = "better";
  else if (measurement.lower! > quantile(peers.map((m) => m.upper!), .75)!) verdict = "worse";
  else if (measurement.decline! >= q25! && measurement.decline! <= q75! && q25! < q75!) verdict = "usual";
  else verdict = "close";
  return { ...segment, ...measurement, verdict, peer_count: peers.length,
    usual_loss: usual, excess_loss: usual == null ? null : measurement.drop_pts! - usual,
    q25: enough ? q25 : null, median: enough ? median : null, q75: enough ? q75 : null,
    alignment: segment.end_s > duration - RETENTION_SETTINGS.endRegionSeconds ? "ending" : "elapsed",
  };
}

export function typicalAt(cohort: RetentionVideo[], second: number): CumulativePoint {
  const values = cohort.flatMap((v) => {
    if (second > (v.duration_ms ?? 0) / 1_000) return [];
    const curve = usableCurve(v.retention_curve);
    const retained = curve ? retentionAt(curve, second) : null;
    return retained == null ? [] : [retained];
  });
  return { second, n: values.length, retained: values.length >= RETENTION_SETTINGS.minimumPeers ? quantile(values, .5) : null };
}

export function analyzeRetention(target: RetentionVideo, source: TikTokSourceSegment[] | null, candidates: RetentionVideo[]): RetentionAnalysis {
  const curve = usableCurve(target.retention_curve) ?? [];
  const cohort = selectCohort(target, candidates);
  const segments = (Array.isArray(source) ? source : [])
    .filter((s) => s && ((typeof s.spoken === "string" && s.spoken.trim()) || (typeof s.on_screen === "string" && s.on_screen.trim())))
    .map((s) => ({ ...s, spoken: typeof s.spoken === "string" ? s.spoken.trim() : null,
      on_screen: typeof s.on_screen === "string" ? s.on_screen.trim() : null }))
    .sort((a, b) => a.start_s - b.start_s || a.end_s - b.end_s)
    .map((s) => comparePassage(target, s, cohort));
  const cumulative = curve.map((p) => typicalAt(cohort, p.second));
  const hook = typicalAt(cohort, 3);
  const endSecond = (target.duration_ms ?? 0) / 1_000;
  const end = typicalAt(cohort, endSecond);
  let worstIndex: number | null = null;
  let steepestIndex: number | null = null;
  segments.forEach((s, i) => {
    if (s.quality === "ok" && (steepestIndex == null || s.drop_pts! > segments[steepestIndex].drop_pts!)) steepestIndex = i;
    if (s.verdict === "worse" && (worstIndex == null || s.excess_loss! > segments[worstIndex].excess_loss!)) worstIndex = i;
  });
  return { curve, segments, cumulative, account: accountFor(target.permalink), early: !isMature(target),
    comparisonAvailable: !!accountFor(target.permalink) && Number.isFinite(timestamp(target.create_time)) && endSecond > 0,
    cohort: cohort.map(({ id, tiktok_id, create_time, fetched_at }) => ({ id, tiktok_id, create_time, fetched_at })),
    hook: { retained: retentionAt(curve, 3), typical: hook.retained, n: hook.n },
    end: { second: endSecond, retained: endSecond > 0 ? retentionAt(curve, endSecond) : null, typical: end.retained, n: end.n },
    worstIndex, steepestIndex,
  };
}
