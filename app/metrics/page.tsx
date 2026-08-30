import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { Topbar } from "@/components/Topbar";
import { getWorkspaceTabs } from "@/lib/workspaceTabs";
import Link from "next/link";
import { getRepurposedReelIds } from "@/lib/repurposedReels";
import { MetricsClient } from "./MetricsClient";
import { TiktokMetricsClient } from "./TiktokMetricsClient";

export const dynamic = "force-dynamic";

export type ReelRow = {
  id: number;
  title_hook: string | null;
  transcript_head: string | null;
  caption: string | null;
  permalink: string | null;
  created_at: string;
  reach: number | null;
  follows_generated: number | null;
  skip_rate: string | null;
  avg_watch_time: number | null;
  saves: number | null;
  shares: number | null;
  likes: number | null;
  comments: number | null;
  is_trial_reel: boolean | null;
  has_curve: boolean;
  pending_rewrites: number;
  repurposed: boolean;
};

export type TiktokRow = {
  id: number;
  tiktok_id: string;
  caption: string | null;
  spoken_hook: string | null;
  permalink: string | null;
  create_time: string | null;
  duration_ms: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  finish_rate: string | null;
  avg_watch_time: string | null;
  follows_generated: number | null;
  has_curve: boolean;
  has_analysis: boolean;
};

export default async function MetricsPage({
  searchParams,
}: {
  searchParams: Promise<{ platform?: string }>;
}) {
  const { platform: platformParam } = await searchParams;
  const platform = platformParam === "tiktok" ? "tiktok" : "instagram";
  // Workspace tabs are derived from scripts.status (#4044).
  const { tabs: workspaceTabs } = await getWorkspaceTabs();

  const ideasCount = ((await db.execute(sql`
    SELECT COUNT(*)::int AS c FROM video_ideas
    WHERE recorded = false AND (ideation_status IS NULL OR ideation_status != 'archived')
  `).catch(() => ({ rows: [{ c: 0 }] }))).rows[0] as { c: number }).c;

  const metricsCount = ((await db.execute(sql`
    SELECT COUNT(DISTINCT instagram_metrics_id)::int AS c
    FROM video_rewrites WHERE status = 'pending'
  `).catch(() => ({ rows: [{ c: 0 }] }))).rows[0] as { c: number }).c;

  let rows: ReelRow[] = [];
  let tiktokRows: TiktokRow[] = [];
  let loadFailed = false;

  if (platform === "tiktok") {
    const tiktokRes = await db.execute(sql`
      SELECT
        m.id,
        m.tiktok_id,
        m.caption,
        NULLIF(vca.segments -> 0 ->> 'spoken', '') AS spoken_hook,
        m.permalink,
        m.create_time,
        m.duration_ms,
        m.views,
        m.likes,
        m.comments,
        m.shares,
        m.saves,
        m.finish_rate,
        m.avg_watch_time,
        m.follows_generated,
        (m.retention_curve IS NOT NULL) AS has_curve,
        (vca.id IS NOT NULL AND vca.processing_status = 'completed') AS has_analysis
      FROM tiktok_metrics m
      LEFT JOIN video_content_analysis vca ON vca.tiktok_metrics_id = m.id
      ORDER BY m.create_time DESC NULLS LAST, m.id DESC
    `).catch(() => {
      loadFailed = true;
      return { rows: [] };
    });
    tiktokRows = tiktokRes.rows as TiktokRow[];
  } else {
    const rowsRes = await db.execute(sql`
      SELECT
        m.id,
        m.title_hook,
        LEFT(vca.transcript, 160) AS transcript_head,
        m.caption,
        m.permalink,
        m.created_at,
        m.reach,
        m.follows_generated,
        m.skip_rate,
        m.avg_watch_time,
        m.saves,
        m.shares,
        m.likes,
        m.comments,
        m.is_trial_reel,
        (m.retention_curve IS NOT NULL) AS has_curve,
        (SELECT COUNT(*)::int FROM video_rewrites r
          WHERE r.instagram_metrics_id = m.id AND r.status = 'pending') AS pending_rewrites
      FROM instagram_metrics m
      LEFT JOIN video_content_analysis vca ON vca.instagram_metrics_id = m.id
      ORDER BY m.created_at DESC, m.id DESC
    `).catch(() => {
      loadFailed = true;
      return { rows: [] };
    });
    const repurposedIds = await getRepurposedReelIds();
    rows = (rowsRes.rows as Omit<ReelRow, "repurposed">[]).map((r) => ({
      ...r,
      repurposed: repurposedIds.has(r.id),
    }));
  }

  const selectedCount = platform === "tiktok" ? tiktokRows.length : rows.length;

  return (
    <>
      <Topbar
        ideasCount={ideasCount}
        metricsCount={metricsCount}
        activeTab="metrics"
        workspaceTabs={workspaceTabs}
      />

      <main className="main">
        <div className="container">
          <div className="pagehead">
            <div className="pagehead__eyebrow">Analytics</div>
            <h1 className="pagehead__title">{platform === "tiktok" ? "TikTok videos" : "Posted reels"}</h1>
            <p className="pagehead__sub">
              {platform === "tiktok"
                ? `${selectedCount} video${selectedCount === 1 ? "" : "s"} on record. Find the exact words and visuals where attention slips.`
                : `${selectedCount} reel${selectedCount === 1 ? "" : "s"} on record. Scan by title hook, fill the gaps, queue rewrites on the ones worth remaking.`}
            </p>
            <nav className="m-platforms" aria-label="Metrics platform">
              <Link className={`m-platform${platform === "instagram" ? " m-platform--active" : ""}`} href="/metrics" aria-current={platform === "instagram" ? "page" : undefined}>
                Instagram
              </Link>
              <Link className={`m-platform${platform === "tiktok" ? " m-platform--active" : ""}`} href="/metrics?platform=tiktok" aria-current={platform === "tiktok" ? "page" : undefined}>
                TikTok
              </Link>
            </nav>
          </div>

          {platform === "tiktok"
            ? <TiktokMetricsClient rows={tiktokRows} loadFailed={loadFailed} />
            : <MetricsClient rows={rows} />}
        </div>
      </main>
    </>
  );
}
