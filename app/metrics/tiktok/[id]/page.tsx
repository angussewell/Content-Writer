import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TiktokDetailClient } from "./TiktokDetailClient";
import { analyzeRetention, RETENTION_SETTINGS, type RetentionVideo, type TikTokCurvePoint, type TikTokSourceSegment } from "@/lib/tiktokRetention";

export const dynamic = "force-dynamic";

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

export default async function TikTokDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idValue } = await params;
  const id = Number(idValue);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();

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

  // Current metrics have one row per upload and the newest fetched curve. Snapshots
  // are older observations of those same uploads, not extra comparison videos.
  const peers = video.create_time && video.duration_ms ? await db.execute(sql`
    SELECT id, tiktok_id, duration_ms, create_time, fetched_at, views, permalink, retention_curve
    FROM tiktok_metrics
    WHERE tiktok_id <> ${video.tiktok_id}
      AND create_time < ${video.create_time}
      AND create_time >= ${video.create_time}::timestamptz - ${RETENTION_SETTINGS.lookbackDays} * interval '1 day'
      AND duration_ms BETWEEN ${Math.ceil(video.duration_ms * (1 - RETENTION_SETTINGS.runtimeTolerance))}
                          AND ${Math.floor(video.duration_ms * (1 + RETENTION_SETTINGS.runtimeTolerance))}
      AND retention_curve IS NOT NULL
    ORDER BY create_time DESC, id DESC
  `) : { rows: [] };
  // Select after validating curves, measurement age, views and account identity.
  // Read source boundaries directly; the shared lag-based view misattributes intervals.
  const analysis = analyzeRetention(video, video.segments, peers.rows as RetentionVideo[]);

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
        <TiktokDetailClient video={video} analysis={analysis} />
      </div>
    </main>
  );
}
