import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MetricDetailClient } from "./MetricDetailClient";

export const dynamic = "force-dynamic";

export type CurvePoint = { t: number; pct: number };
export type RetentionCurve = { curve: CurvePoint[]; summary?: string } | null;

export type ReelDetail = {
  id: number;
  title_hook: string | null;
  caption: string | null;
  permalink: string | null;
  instagram_id: string;
  created_at: string;
  fetched_at: string | null;
  reach: number | null;
  follows_generated: number | null;
  skip_rate: string | null;
  avg_watch_time: number | null;
  saves: number | null;
  shares: number | null;
  likes: number | null;
  comments: number | null;
  is_trial_reel: boolean | null;
  analyst_notes: string | null;
  youtube_shorts_uploaded: boolean | null;
  tiktok_uploaded: boolean | null;
  retention_curve: RetentionCurve;
  transcript: string | null;
  visual_description: string | null;
  descriptors: Record<string, unknown> | null;
  question_set_version: string | null;
};

export type RewriteRow = {
  id: number;
  title: string | null;
  rewrite_request: string;
  status: string;
  result_script_id: string | null;
  notes: string | null;
  created_at: string;
  completed_at: string | null;
};

export default async function ReelDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (!Number.isFinite(id)) notFound();

  const res = await db.execute(sql`
    SELECT
      m.id, m.title_hook, m.caption, m.permalink, m.instagram_id, m.created_at, m.fetched_at,
      m.reach, m.follows_generated, m.skip_rate, m.avg_watch_time, m.saves, m.shares, m.likes, m.comments,
      m.is_trial_reel, m.analyst_notes, m.youtube_shorts_uploaded, m.tiktok_uploaded, m.retention_curve,
      vca.transcript, vca.visual_description,
      vf.descriptors, vf.question_set_version
    FROM instagram_metrics m
    LEFT JOIN video_content_analysis vca ON vca.instagram_metrics_id = m.id
    LEFT JOIN LATERAL (
      SELECT descriptors, question_set_version FROM video_features f
      WHERE f.instagram_metrics_id = m.id
      ORDER BY f.analyzed_at DESC LIMIT 1
    ) vf ON TRUE
    WHERE m.id = ${id}
    LIMIT 1
  `).catch(() => ({ rows: [] }));

  if (res.rows.length === 0) notFound();
  const reel = res.rows[0] as ReelDetail;

  const rewritesRes = await db.execute(sql`
    SELECT id, title, rewrite_request, status, result_script_id, notes, created_at, completed_at
    FROM video_rewrites
    WHERE instagram_metrics_id = ${id}
    ORDER BY created_at DESC, id DESC
  `).catch(() => ({ rows: [] }));
  const rewrites = rewritesRes.rows as RewriteRow[];

  return (
    <main className="main">
      <div className="container container--narrow">
        <div className="m-detail-back">
          <Link href="/metrics" className="m-back">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M9 3 L4 8 L9 13 M4 8 H14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            All reels
          </Link>
        </div>
        <MetricDetailClient reel={reel} rewrites={rewrites} />
      </div>
    </main>
  );
}
