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
  archived_at: string | null;
  created_at: string;
};

type Counts = { fresh: number; recorded: number; archived: number; total: number };
type YtCounts = { queue: number; posted: number; archived: number; total: number };

const YT_STATUSES = ["queue", "posted", "archived", "all"];
const VIDEO_STATUSES = ["fresh", "recorded", "archived", "all"];

function normStatus(dataset: string, status: string) {
  if (dataset === "youtube") return YT_STATUSES.includes(status) ? status : "queue";
  return VIDEO_STATUSES.includes(status) ? status : "fresh";
}

function isDefaultStatus(dataset: string, status: string) {
  return dataset === "youtube" ? status === "queue" : status === "fresh";
}

export default async function IdeasPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; sort?: string; dataset?: string }>;
}) {
  const sp = await searchParams;
  const dataset = sp.dataset === "youtube" ? "youtube" : "video";
  const q = sp.q ?? "";
  const sort = sp.sort === "oldest" ? "oldest" : "recent";
  const status = normStatus(dataset, sp.status ?? "");

  // ---- Short-idea (video) counts ----
  const countsResult = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE recorded = false AND (ideation_status IS NULL OR ideation_status != 'archived'))::int AS fresh,
      COUNT(*) FILTER (WHERE recorded = true)::int AS recorded,
      COUNT(*) FILTER (WHERE ideation_status = 'archived')::int AS archived,
      COUNT(*)::int AS total
    FROM video_ideas
  `).catch(() => ({ rows: [{ fresh: 0, recorded: 0, archived: 0, total: 0 }] }));
  const counts = countsResult.rows[0] as Counts;

  // ---- YouTube-concept counts ----
  const ytCountsResult = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE archived_at IS NULL AND status <> 'posted')::int AS queue,
      COUNT(*) FILTER (WHERE archived_at IS NULL AND status = 'posted')::int AS posted,
      COUNT(*) FILTER (WHERE archived_at IS NOT NULL)::int AS archived,
      COUNT(*)::int AS total
    FROM youtube_ideas
  `).catch(() => ({ rows: [{ queue: 0, posted: 0, archived: 0, total: 0 }] }));
  const ytCounts = ytCountsResult.rows[0] as YtCounts;

  // Workspace tab counts
  const wsCounts = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'draft')::int AS write_count,
      COUNT(*) FILTER (WHERE status = 'filmed')::int AS edit_count,
      COUNT(*) FILTER (WHERE status IN ('done', 'archived'))::int AS archive_count
    FROM scripts
  `);
  const ws = wsCounts.rows[0] as { write_count: number; edit_count: number; archive_count: number };

  const metricsCountRes = await db.execute(sql`
    SELECT COUNT(DISTINCT instagram_metrics_id)::int AS c
    FROM video_rewrites WHERE status = 'pending'
  `).catch(() => ({ rows: [{ c: 0 }] }));
  const metricsCount = (metricsCountRes.rows[0] as { c: number }).c;

  const orderSql = sort === "oldest" ? sql`ORDER BY created_at ASC` : sql`ORDER BY created_at DESC`;

  // ---- Video ideas query ----
  const vQSql = q ? sql`AND transcript ILIKE ${"%" + q + "%"}` : sql``;
  const vStatusSql =
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
        ${vStatusSql}
        ${vQSql}
        ${orderSql}
        LIMIT 200
      `).catch(() => ({ rows: [] }))
    : { rows: [] };
  const videoIdeas = videoIdeasResult.rows as VideoIdeaRow[];

  // ---- YouTube ideas query ----
  const ytQSql = q
    ? sql`AND (title ILIKE ${"%" + q + "%"} OR description ILIKE ${"%" + q + "%"} OR notes ILIKE ${"%" + q + "%"})`
    : sql``;
  const ytStatusSql =
    status === "posted"
      ? sql`WHERE archived_at IS NULL AND status = 'posted'`
      : status === "archived"
      ? sql`WHERE archived_at IS NOT NULL`
      : status === "all"
      ? sql`WHERE TRUE`
      : sql`WHERE archived_at IS NULL AND status <> 'posted'`;

  const youtubeIdeasResult = dataset === "youtube"
    ? await db.execute(sql`
        SELECT id::text AS id, title, description, status, notes, format, hypothesis, result, verdict, lesson,
               filmed_at, archived_at, created_at
        FROM youtube_ideas
        ${ytStatusSql}
        ${ytQSql}
        ${orderSql}
        LIMIT 200
      `).catch(() => ({ rows: [] }))
    : { rows: [] };
  const youtubeIdeas = youtubeIdeasResult.rows as YoutubeIdeaRow[];

  const buildHref = (overrides: Record<string, string | undefined>) => {
    const merged = { status, q, sort, dataset, ...overrides };
    const ds = merged.dataset || "video";
    const st = normStatus(ds, merged.status || "");
    const params = new URLSearchParams();
    if (ds !== "video") params.set("dataset", ds);
    if (!isDefaultStatus(ds, st)) params.set("status", st);
    if (merged.q) params.set("q", merged.q);
    if (merged.sort && merged.sort !== "recent") params.set("sort", merged.sort);
    const qs = params.toString();
    return qs ? `/ideas?${qs}` : "/ideas";
  };

  const isYoutube = dataset === "youtube";

  return (
    <>
      <Topbar
        ideasCount={counts.fresh}
        metricsCount={metricsCount}
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
            <div className="pagehead__eyebrow">{isYoutube ? "Reaction pipeline" : "Inbox"}</div>
            <h1 className="pagehead__title">{isYoutube ? "YouTube concepts" : "The idea notebook"}</h1>
            <p className="pagehead__sub">
              {isYoutube
                ? "Traction-validated reaction concepts. Skim the queue, open one to see the full brief, then send it to reaction prep. Posted and archived stay out of the way until you ask for them."
                : "Voice memos from the field, fresh off Telegram. Skim, copy the ones that spark, archive the rest. Your favourite gets piped straight to the script agent."}
            </p>
          </div>

          <div className="filterrow">
            <div className="segmented" role="tablist" aria-label="Status filter">
              {isYoutube ? (
                <>
                  <Link
                    href={buildHref({ status: "queue" })}
                    className={"segmented__btn segmented__btn--fresh" + (status === "queue" ? " segmented__btn--on" : "")}
                  >
                    <span className="segmented__dot" /> Queue <span className="seg-count">{ytCounts.queue}</span>
                  </Link>
                  <Link
                    href={buildHref({ status: "posted" })}
                    className={"segmented__btn segmented__btn--recorded" + (status === "posted" ? " segmented__btn--on" : "")}
                  >
                    <span className="segmented__dot" /> Posted <span className="seg-count">{ytCounts.posted}</span>
                  </Link>
                  <Link
                    href={buildHref({ status: "archived" })}
                    className={"segmented__btn segmented__btn--archived" + (status === "archived" ? " segmented__btn--on" : "")}
                  >
                    <span className="segmented__dot" /> Archived <span className="seg-count">{ytCounts.archived}</span>
                  </Link>
                  <Link
                    href={buildHref({ status: "all" })}
                    className={"segmented__btn" + (status === "all" ? " segmented__btn--on" : "")}
                  >
                    All <span className="seg-count">{ytCounts.total}</span>
                  </Link>
                </>
              ) : (
                <>
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
                </>
              )}
            </div>

            <form className="search-wrap" action="/ideas" method="get">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.4" />
                <path d="M11 11 L14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              <input
                type="search"
                name="q"
                defaultValue={q}
                placeholder={isYoutube ? "Search concepts…" : "Search transcripts…"}
              />
              {!isDefaultStatus(dataset, status) && <input type="hidden" name="status" value={status} />}
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
              <span className="dataset__count">{ytCounts.queue}</span>
            </div>
            <span className="collection-head__rule" />
          </div>

          <IdeasClient dataset={dataset} videoIdeas={videoIdeas} youtubeIdeas={youtubeIdeas} />

          <footer className="footer">
            <span className="footer__line" />
            <span className="footer__txt">
              {isYoutube
                ? `${ytCounts.queue} in the queue · ${ytCounts.posted} posted · ${ytCounts.archived} archived`
                : `${counts.fresh} fresh idea${counts.fresh === 1 ? "" : "s"} waiting · ${counts.recorded} recorded · ${counts.archived} archived`}
            </span>
          </footer>
        </div>
      </main>
    </>
  );
}
