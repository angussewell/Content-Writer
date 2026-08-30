import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import Link from "next/link";
import { Topbar } from "@/components/Topbar";
import { getWorkspaceTabs } from "@/lib/workspaceTabs";
import { fmtClock } from "@/lib/utils";

export const dynamic = "force-dynamic";

type ConceptRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  filmed_at: string | null;
  archived_at: string | null;
  created_at: string;
  section_count: number;
  total_seconds: number;
  filmed_count: number;
};

type YtCounts = { queue: number; posted: number; archived: number; total: number };

const STATUSES = ["queue", "posted", "archived", "all"];

function stageOf(row: ConceptRow): "idea" | "prepped" | "filmed" | "posted" | "archived" {
  if (row.archived_at) return "archived";
  if (row.status === "prepped") return "prepped";
  if (row.status === "filmed") return "filmed";
  if (row.status === "posted") return "posted";
  return "idea";
}

const STAGE_LABEL: Record<string, string> = {
  idea: "Idea",
  prepped: "Prepped",
  filmed: "Filmed",
  posted: "Posted",
  archived: "Archived",
};

function shortId(id: string) {
  return id.replace(/-/g, "").slice(0, 6);
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  const diffDays = Math.floor(
    (new Date().setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) / 86400000
  );
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase();
}

export default async function YoutubePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const status = STATUSES.includes(sp.status ?? "") ? (sp.status as string) : "queue";

  // Topbar counts (same shape as the other boards).
  const ideasCountRes = await db.execute(sql`
    SELECT COUNT(*)::int AS c FROM video_ideas
    WHERE recorded = false AND (ideation_status IS NULL OR ideation_status != 'archived')
  `).catch(() => ({ rows: [{ c: 0 }] }));
  const ideasCount = (ideasCountRes.rows[0] as { c: number }).c;

  // Workspace tabs are derived from scripts.status (#4044).
  const { tabs: workspaceTabs } = await getWorkspaceTabs();

  const ytCountsResult = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE archived_at IS NULL AND status <> 'posted')::int AS queue,
      COUNT(*) FILTER (WHERE archived_at IS NULL AND status = 'posted')::int AS posted,
      COUNT(*) FILTER (WHERE archived_at IS NOT NULL)::int AS archived,
      COUNT(*)::int AS total
    FROM youtube_ideas
  `).catch(() => ({ rows: [{ queue: 0, posted: 0, archived: 0, total: 0 }] }));
  const ytCounts = ytCountsResult.rows[0] as YtCounts;

  const statusSql =
    status === "posted"
      ? sql`WHERE yi.archived_at IS NULL AND yi.status = 'posted'`
      : status === "archived"
      ? sql`WHERE yi.archived_at IS NOT NULL`
      : status === "all"
      ? sql`WHERE TRUE`
      : sql`WHERE yi.archived_at IS NULL AND yi.status <> 'posted'`;

  const conceptsResult = await db.execute(sql`
    SELECT yi.id::text AS id, yi.title, yi.description, yi.status,
           yi.filmed_at, yi.archived_at, yi.created_at,
           COUNT(s.id)::int AS section_count,
           COALESCE(SUM(s.target_seconds), 0)::int AS total_seconds,
           COUNT(s.id) FILTER (WHERE s.status = 'filmed')::int AS filmed_count
    FROM youtube_ideas yi
    LEFT JOIN youtube_film_sections s ON s.youtube_idea_id = yi.id
    ${statusSql}
    GROUP BY yi.id
    ORDER BY (COUNT(s.id) > 0) DESC, yi.created_at DESC
    LIMIT 200
  `).catch(() => ({ rows: [] }));
  const concepts = conceptsResult.rows as ConceptRow[];

  const scripted = concepts.filter((c) => c.section_count > 0).length;

  const buildHref = (st: string) => (st === "queue" ? "/youtube" : `/youtube?status=${st}`);

  return (
    <>
      <Topbar
        ideasCount={ideasCount}
        youtubeCount={ytCounts.queue}
        activeTab="youtube"
        workspaceTabs={workspaceTabs}
      />

      <main className="main">
        <div className="container">
          <div className="pagehead">
            <div className="pagehead__eyebrow">Long-form pipeline</div>
            <h1 className="pagehead__title">YouTube scripts</h1>
            <p className="pagehead__sub">
              Every concept with its sectioned film script. Open one to work the script beat by
              beat — timings, on-screen cues, what to say, and what&rsquo;s already filmed.
            </p>
          </div>

          <div className="filterrow">
            <div className="segmented" role="tablist" aria-label="Status filter">
              <Link
                href={buildHref("queue")}
                className={"segmented__btn segmented__btn--fresh" + (status === "queue" ? " segmented__btn--on" : "")}
              >
                <span className="segmented__dot" /> Queue <span className="seg-count">{ytCounts.queue}</span>
              </Link>
              <Link
                href={buildHref("posted")}
                className={"segmented__btn segmented__btn--recorded" + (status === "posted" ? " segmented__btn--on" : "")}
              >
                <span className="segmented__dot" /> Posted <span className="seg-count">{ytCounts.posted}</span>
              </Link>
              <Link
                href={buildHref("archived")}
                className={"segmented__btn segmented__btn--archived" + (status === "archived" ? " segmented__btn--on" : "")}
              >
                <span className="segmented__dot" /> Archived <span className="seg-count">{ytCounts.archived}</span>
              </Link>
              <Link
                href={buildHref("all")}
                className={"segmented__btn" + (status === "all" ? " segmented__btn--on" : "")}
              >
                All <span className="seg-count">{ytCounts.total}</span>
              </Link>
            </div>
          </div>

          {concepts.length === 0 ? (
            <div className="empty">
              <div className="empty__mark">❦</div>
              <p className="empty__txt">No concepts under this filter.</p>
            </div>
          ) : (
            <section className="yt-list">
              {concepts.map((c) => {
                const stage = stageOf(c);
                const hasScript = c.section_count > 0;
                return (
                  <Link
                    key={c.id}
                    href={`/youtube/${c.id}`}
                    className="yt-row yt-row--link"
                    data-stage={stage}
                  >
                    <span className={`yt-stage yt-stage--${stage}`}>
                      <span className="yt-stage__dot" /> {STAGE_LABEL[stage]}
                    </span>

                    <div className="yt-row__main">
                      <h3 className="yt-row__title">{c.title}</h3>
                      {c.description && <p className="yt-row__sub">{c.description}</p>}
                      <div className="yt-row__meta">
                        {hasScript ? (
                          <>
                            <span className="yt-row__script">
                              {c.section_count} section{c.section_count === 1 ? "" : "s"}
                            </span>
                            <span className="sep" />
                            <span>{c.total_seconds > 0 ? fmtClock(c.total_seconds) : "untimed"}</span>
                            <span className="sep" />
                            <span className={c.filmed_count === c.section_count ? "yt-row__done" : undefined}>
                              {c.filmed_count}/{c.section_count} filmed
                            </span>
                          </>
                        ) : (
                          <span className="yt-row__noscript">No script yet</span>
                        )}
                        <span className="sep" />
                        <span className="yt-row__date">{fmtDate(c.created_at)}</span>
                        <span className="sep" />
                        <span className="yt-row__id"><span className="hash">#</span>{shortId(c.id)}</span>
                      </div>
                    </div>

                    <div className="yt-row__actions yt-row__actions--bare">
                      <span className="yt-row__chev" aria-hidden="true">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path d="M5 3 L9 7 L5 11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                    </div>
                  </Link>
                );
              })}
            </section>
          )}

          <footer className="footer">
            <span className="footer__line" />
            <span className="footer__txt">
              {scripted} of {concepts.length} concept{concepts.length === 1 ? "" : "s"} scripted
            </span>
          </footer>
        </div>
      </main>
    </>
  );
}
