import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { Topbar } from "@/components/Topbar";
import { MetricsClient } from "./MetricsClient";

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
};

export default async function MetricsPage() {
  const ws = (await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'draft')::int AS write_count,
      COUNT(*) FILTER (WHERE status = 'filmed')::int AS edit_count,
      COUNT(*) FILTER (WHERE status IN ('done', 'archived'))::int AS archive_count
    FROM scripts
  `).catch(() => ({ rows: [{ write_count: 0, edit_count: 0, archive_count: 0 }] }))).rows[0] as {
    write_count: number; edit_count: number; archive_count: number;
  };

  const ideasCount = ((await db.execute(sql`
    SELECT COUNT(*)::int AS c FROM video_ideas
    WHERE recorded = false AND (ideation_status IS NULL OR ideation_status != 'archived')
  `).catch(() => ({ rows: [{ c: 0 }] }))).rows[0] as { c: number }).c;

  const metricsCount = ((await db.execute(sql`
    SELECT COUNT(DISTINCT instagram_metrics_id)::int AS c
    FROM video_rewrites WHERE status = 'pending'
  `).catch(() => ({ rows: [{ c: 0 }] }))).rows[0] as { c: number }).c;

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
  `).catch(() => ({ rows: [] }));
  const rows = rowsRes.rows as ReelRow[];

  return (
    <>
      <Topbar
        ideasCount={ideasCount}
        metricsCount={metricsCount}
        activeTab="metrics"
        workspaceTabs={[
          { id: "write", label: "Write", count: ws.write_count, href: "/?tab=write" },
          { id: "edit", label: "Edit", count: ws.edit_count, href: "/?tab=edit" },
          { id: "archive", label: "Archive", count: ws.archive_count, href: "/?tab=archive" },
        ]}
      />

      <main className="main">
        <div className="container">
          <div className="pagehead">
            <div className="pagehead__eyebrow">Analytics</div>
            <h1 className="pagehead__title">Posted reels</h1>
            <p className="pagehead__sub">
              {rows.length} reel{rows.length === 1 ? "" : "s"} on record. Scan by title hook, fill the gaps,
              queue rewrites on the ones worth remaking.
            </p>
          </div>

          <MetricsClient rows={rows} />
        </div>
      </main>
    </>
  );
}
