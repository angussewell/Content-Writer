import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TiktokDetailClient } from "./TiktokDetailClient";

export const dynamic = "force-dynamic";

export type TikTokCurvePoint = {
  second: number;
  retained_fraction: number;
};

export type TikTokSourceSegment = {
  start_s: number;
  end_s: number;
  spoken: string | null;
  on_screen: string | null;
};

export type TikTokRetentionSegment = TikTokSourceSegment & {
  retained_start: number | null;
  retained_end: number | null;
  drop_pts: number | null;
};

export type TikTokDetail = {
  id: number;
  tiktok_id: string;
  caption: string | null;
  duration_ms: number | null;
  create_time: string | null;
  permalink: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  finish_rate: string | null;
  avg_watch_time: string | null;
  total_watch_time: string | null;
  follows_generated: number | null;
  retention_curve: TikTokCurvePoint[] | null;
  fetched_at: string | null;
  transcript: string | null;
  visual_description: string | null;
  segments: TikTokSourceSegment[] | null;
  processing_status: string | null;
  source_duration_ms: number | null;
};

type RetentionMapRow = {
  second: number;
  retained: number;
  drop_pts: number;
  spoken: string | null;
  on_screen: string | null;
};

function normalized(value: string | null) {
  return value?.trim() || null;
}

function groupRetentionRows(rows: RetentionMapRow[]): TikTokRetentionSegment[] {
  const grouped: TikTokRetentionSegment[] = [];
  for (const row of rows) {
    const spoken = normalized(row.spoken);
    const onScreen = normalized(row.on_screen);
    if (!spoken && !onScreen) continue;

    const previous = grouped[grouped.length - 1];
    if (previous && previous.spoken === spoken && previous.on_screen === onScreen && previous.end_s === row.second) {
      previous.end_s = row.second + 1;
      previous.retained_end = row.retained * 100;
      previous.drop_pts = (previous.drop_pts ?? 0) + Math.max(0, row.drop_pts);
      continue;
    }

    grouped.push({
      start_s: row.second,
      end_s: row.second + 1,
      spoken,
      on_screen: onScreen,
      retained_start: row.retained * 100,
      retained_end: row.retained * 100,
      drop_pts: Math.max(0, row.drop_pts),
    });
  }
  return grouped;
}

export default async function TikTokDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idValue } = await params;
  const id = Number.parseInt(idValue, 10);
  if (!Number.isFinite(id)) notFound();

  const result = await db.execute(sql`
    SELECT
      m.id,
      m.tiktok_id,
      m.caption,
      m.duration_ms,
      m.create_time,
      m.permalink,
      m.views,
      m.likes,
      m.comments,
      m.shares,
      m.saves,
      m.finish_rate,
      m.avg_watch_time,
      m.total_watch_time,
      m.follows_generated,
      m.retention_curve,
      m.fetched_at,
      vca.transcript,
      vca.visual_description,
      vca.segments,
      vca.processing_status,
      vca.source_duration_ms
    FROM tiktok_metrics m
    LEFT JOIN video_content_analysis vca ON vca.tiktok_metrics_id = m.id
    WHERE m.id = ${id}
    LIMIT 1
  `).catch(() => ({ rows: [] }));

  if (result.rows.length === 0) notFound();
  const video = result.rows[0] as TikTokDetail;

  const mapResult = await db.execute(sql`
    SELECT
      second,
      retained::float8 AS retained,
      drop_pts::float8 AS drop_pts,
      spoken,
      on_screen
    FROM tiktok_retention_map
    WHERE tiktok_metrics_id = ${id}
    ORDER BY second
  `).catch(() => ({ rows: [] }));

  let retentionSegments = groupRetentionRows(mapResult.rows as RetentionMapRow[]);
  if (retentionSegments.length === 0 && Array.isArray(video.segments)) {
    retentionSegments = video.segments
      .filter((segment) => segment.spoken?.trim() || segment.on_screen?.trim())
      .map((segment) => ({
        start_s: Number(segment.start_s),
        end_s: Number(segment.end_s),
        spoken: normalized(segment.spoken),
        on_screen: normalized(segment.on_screen),
        retained_start: null,
        retained_end: null,
        drop_pts: null,
      }));
  }

  return (
    <main className="main">
      <div className="container container--analysis">
        <div className="m-detail-back">
          <Link href="/metrics?platform=tiktok" className="m-back">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M9 3 L4 8 L9 13 M4 8 H14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            All TikToks
          </Link>
        </div>
        <TiktokDetailClient video={video} retentionSegments={retentionSegments} />
      </div>
    </main>
  );
}
