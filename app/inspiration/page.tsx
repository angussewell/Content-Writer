import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { Topbar } from "@/components/Topbar";
import { getWorkspaceTabs } from "@/lib/workspaceTabs";
import { InspirationLibrary, type InspirationHook } from "./InspirationLibrary";

export const dynamic = "force-dynamic";

export default async function InspirationPage() {
  const [hooksResult, workspaceResult, ideasResult, youtubeResult, wireResult, metricsResult] = await Promise.all([
    db.execute(sql`
      SELECT id::text AS id, platform, source_post_id, source_url, creator_handle,
             first_sentence, second_sentence, on_screen_text, opening_visual,
             views::text AS views, creator_followers::text AS creator_followers,
             notes, saved_at, updated_at
      FROM inspiration_hooks
      ORDER BY saved_at DESC, id DESC
    `).catch(() => ({ rows: [] })),
    getWorkspaceTabs(),
    db.execute(sql`
      SELECT COUNT(*)::int AS c FROM video_ideas
      WHERE recorded = false AND (ideation_status IS NULL OR ideation_status != 'archived')
    `).catch(() => ({ rows: [{ c: 0 }] })),
    db.execute(sql`
      SELECT COUNT(*)::int AS c FROM youtube_ideas
      WHERE archived_at IS NULL AND status <> 'posted'
    `).catch(() => ({ rows: [{ c: 0 }] })),
    db.execute(sql`SELECT COUNT(*) FILTER (WHERE surfaced IS NOT TRUE)::int AS c FROM buzz_stories`)
      .catch(() => ({ rows: [{ c: 0 }] })),
    db.execute(sql`
      SELECT COUNT(DISTINCT instagram_metrics_id)::int AS c
      FROM video_rewrites WHERE status = 'pending'
    `).catch(() => ({ rows: [{ c: 0 }] })),
  ]);

  const hooks = hooksResult.rows.map((row) => {
    const hook = row as Record<string, unknown>;
    return {
      ...hook,
      saved_at: new Date(hook.saved_at as Date | string).toISOString(),
      updated_at: new Date(hook.updated_at as Date | string).toISOString(),
    } as InspirationHook;
  });
  // Workspace tabs are derived from scripts.status (#4044).
  const workspaceTabs = workspaceResult.tabs;
  const ideasCount = (ideasResult.rows[0] as { c: number }).c;
  const youtubeCount = (youtubeResult.rows[0] as { c: number }).c;
  const wireCount = (wireResult.rows[0] as { c: number }).c;
  const metricsCount = (metricsResult.rows[0] as { c: number }).c;

  return (
    <>
      <Topbar
        ideasCount={ideasCount}
        youtubeCount={youtubeCount}
        wireCount={wireCount}
        metricsCount={metricsCount}
        activeTab="inspiration"
        workspaceTabs={workspaceTabs}
      />

      <main className="main ih-main">
        <div className="container">
          <div className="pagehead ih-pagehead">
            <div className="pagehead__eyebrow">Reference shelf</div>
            <h1 className="pagehead__title">Hooks worth stealing</h1>
            <p className="pagehead__sub">
              Proven openings, stripped to the useful parts. Read the spoken hook first, then inspect the title card and opening shot.
            </p>
          </div>
          <InspirationLibrary initialHooks={hooks} />
        </div>
      </main>
    </>
  );
}
