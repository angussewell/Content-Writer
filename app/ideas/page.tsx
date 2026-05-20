import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import Link from "next/link";
import { Topbar } from "@/components/Topbar";
import { IdeasClient } from "./IdeasClient";

export const dynamic = "force-dynamic";

type VideoIdeaRow = {
  id: string;
  transcript: string;
  recorded: boolean;
  ideation_status: string | null;
  created_at: string;
  script_id: string | null;
};

type YoutubeIdeaRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  notes: string | null;
  format: string | null;
  hypothesis: string | null;
  result: string | null;
  verdict: string | null;
  lesson: string | null;
  filmed_at: string | null;
};

type Counts = { fresh: number; recorded: number; archived: number; total: number };

export default async function IdeasPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; sort?: string; dataset?: string }>;
}) {
  const { status = "fresh", q = "", sort = "recent", dataset = "video" } = await searchParams;

  const countsResult = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE recorded = false AND (ideation_status IS NULL OR ideation_status != 'archived'))::int AS fresh,
      COUNT(*) FILTER (WHERE recorded = true)::int AS recorded,
      COUNT(*) FILTER (WHERE ideation_status = 'archived')::int AS archived,
      COUNT(*)::int AS total
    FROM video_ideas
  `).catch(() => ({ rows: [{ fresh: 0, recorded: 0, archived: 0, total: 0 }] }));
  const counts = countsResult.rows[0] as Counts;

  // Workspace tab counts
  const wsCounts = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'draft')::int AS write_count,
      COUNT(*) FILTER (WHERE status = 'filmed')::int AS edit_count,
      COUNT(*) FILTER (WHERE status IN ('done', 'archived'))::int AS archive_count
    FROM scripts
  `);
  const ws = wsCounts.rows[0] as { write_count: number; edit_count: number; archive_count: number };

  // Video ideas
  const orderSql = sort === "oldest" ? sql`ORDER BY created_at ASC` : sql`ORDER BY created_at DESC`;
  const qSql = q ? sql`AND transcript ILIKE ${"%" + q + "%"}` : sql``;
  const statusSql =
    status === "fresh"
      ? sql`WHERE recorded = false AND (ideation_status IS NULL OR ideation_status != 'archived')`
      : status === "recorded"
      ? sql`WHERE recorded = true`
      : status === "archived"
      ? sql`WHERE ideation_status = 'archived'`
      : sql`WHERE TRUE`;

  const videoIdeasResult = dataset === "video"
    ? await db.execute(sql`
        SELECT id::text AS id, transcript, recorded, ideation_status, created_at, script_id::text AS script_id
        FROM video_ideas
        ${statusSql}
        ${qSql}
        ${orderSql}
        LIMIT 200
      `).catch(() => ({ rows: [] }))
    : { rows: [] };
  const videoIdeas = videoIdeasResult.rows as VideoIdeaRow[];

  const youtubeIdeasResult = dataset === "youtube"
    ? await db.execute(sql`
        SELECT id::text AS id, title, description, status, notes, format, hypothesis, result, verdict, lesson, filmed_at
        FROM youtube_ideas
        ${orderSql}
        LIMIT 200
      `).catch(() => ({ rows: [] }))
    : { rows: [] };
  const youtubeIdeas = youtubeIdeasResult.rows as YoutubeIdeaRow[];

  const youtubeCountResult = await db.execute(sql`SELECT COUNT(*)::int AS c FROM youtube_ideas`)
    .catch(() => ({ rows: [{ c: 0 }] }));
  const youtubeCount = (youtubeCountResult.rows[0] as { c: number }).c;

  const buildHref = (overrides: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = { status, q, sort, dataset, ...overrides };
    if (merged.dataset && merged.dataset !== "video") params.set("dataset", merged.dataset);
    if (merged.status && merged.status !== "fresh") params.set("status", merged.status);
    if (merged.q) params.set("q", merged.q);
    if (merged.sort && merged.sort !== "recent") params.set("sort", merged.sort);
    const qs = params.toString();
    return qs ? `/ideas?${qs}` : "/ideas";
  };

  const filterDimmed = dataset === "youtube";

  return (
    <>
      <Topbar
        ideasCount={counts.fresh}
        activeTab="ideas"
        workspaceTabs={[
          { id: "write", label: "Write", count: ws.write_count, href: "/?tab=write" },
          { id: "edit", label: "Edit", count: ws.edit_count, href: "/?tab=edit" },
          { id: "archive", label: "Archive", count: ws.archive_count, href: "/?tab=archive" },
        ]}
      />

      <main className="main">
        <div className="container">
          <div className="pagehead">
            <div className="pagehead__eyebrow">Inbox</div>
            <h1 className="pagehead__title">The idea notebook</h1>
            <p className="pagehead__sub">
              Voice memos from the field, fresh off Telegram. Skim, copy the ones that spark, archive the rest. Your favourite gets piped straight to the script agent.
            </p>
          </div>

          <div className={"filterrow" + (filterDimmed ? " filterrow--dimmed" : "")}>
            <div className="segmented" role="tablist" aria-label="Status filter">
              <Link
                href={buildHref({ status: "fresh" })}
                className={"segmented__btn segmented__btn--fresh" + (status === "fresh" ? " segmented__btn--on" : "")}
              >
                <span className="segmented__dot" /> Fresh <span className="seg-count">{counts.fresh}</span>
              </Link>
              <Link
                href={buildHref({ status: "recorded" })}
                className={"segmented__btn segmented__btn--recorded" + (status === "recorded" ? " segmented__btn--on" : "")}
              >
                <span className="segmented__dot" /> Recorded <span className="seg-count">{counts.recorded}</span>
              </Link>
              <Link
                href={buildHref({ status: "archived" })}
                className={"segmented__btn segmented__btn--archived" + (status === "archived" ? " segmented__btn--on" : "")}
              >
                <span className="segmented__dot" /> Archived <span className="seg-count">{counts.archived}</span>
              </Link>
              <Link
                href={buildHref({ status: "all" })}
                className={"segmented__btn" + (status === "all" ? " segmented__btn--on" : "")}
              >
                All <span className="seg-count">{counts.total}</span>
              </Link>
            </div>

            <form className="search-wrap" action="/ideas" method="get">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.4" />
                <path d="M11 11 L14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              <input type="search" name="q" defaultValue={q} placeholder="Search transcripts…" />
              {status !== "fresh" && <input type="hidden" name="status" value={status} />}
              {sort !== "recent" && <input type="hidden" name="sort" value={sort} />}
              {dataset !== "video" && <input type="hidden" name="dataset" value={dataset} />}
            </form>

            <span className="filterrow__spacer" />

            <span className="filterrow__sortlabel">Sort</span>
            <Link
              href={buildHref({ sort: "recent" })}
              className={"sortpill" + (sort === "recent" ? " sortpill--on" : "")}
            >
              Recent
            </Link>
            <Link
              href={buildHref({ sort: "oldest" })}
              className={"sortpill" + (sort === "oldest" ? " sortpill--on" : "")}
            >
              Oldest
            </Link>
          </div>

          <div className="collection-head">
            <div className="dataset" role="tablist" aria-label="Dataset">
              <Link
                href={buildHref({ dataset: "video" })}
                className={"dataset__btn" + (dataset === "video" ? " dataset__btn--on" : "")}
              >
                Short ideas
              </Link>
              <span className="dataset__count">{counts.fresh}</span>
              <span className="dataset__sep" />
              <Link
                href={buildHref({ dataset: "youtube" })}
                className={"dataset__btn" + (dataset === "youtube" ? " dataset__btn--on" : "")}
              >
                YouTube concepts
              </Link>
              <span className="dataset__count">{youtubeCount}</span>
            </div>
            <span className="collection-head__rule" />
          </div>

          <IdeasClient dataset={dataset} videoIdeas={videoIdeas} youtubeIdeas={youtubeIdeas} />

          <footer className="footer">
            <span className="footer__line" />
            <span className="footer__txt">
              {counts.fresh} fresh idea{counts.fresh === 1 ? "" : "s"} waiting · {counts.recorded} recorded · {counts.archived} archived
            </span>
          </footer>
        </div>
      </main>
    </>
  );
}
