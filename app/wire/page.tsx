import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import Link from "next/link";
import { Topbar } from "@/components/Topbar";
import { WireClient } from "./WireClient";

export const dynamic = "force-dynamic";

export type BuzzStory = {
  id: number;
  story_date: string | null;
  summary: string | null;
  react_angle: string | null;
  interest_score: number | null;
  buzz_count: number | null;
  platforms: string[] | null;
  top_url: string | null;
  surfaced: boolean | null;
};

type Counts = { wire: number; spiked: number; total: number };

export default async function WirePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; platform?: string; sort?: string; q?: string }>;
}) {
  const { view = "wire", platform = "all", sort = "recent", q = "" } = await searchParams;

  const countsResult = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE surfaced IS NOT TRUE)::int AS wire,
      COUNT(*) FILTER (WHERE surfaced IS TRUE)::int AS spiked,
      COUNT(*)::int AS total
    FROM buzz_stories
  `).catch(() => ({ rows: [{ wire: 0, spiked: 0, total: 0 }] }));
  const counts = countsResult.rows[0] as Counts;

  // workspace tab counts for the shared topbar
  const ws = (await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'draft')::int AS write_count,
      COUNT(*) FILTER (WHERE status = 'filmed')::int AS edit_count,
      COUNT(*) FILTER (WHERE status IN ('done', 'archived'))::int AS archive_count
    FROM scripts
  `).catch(() => ({ rows: [{ write_count: 0, edit_count: 0, archive_count: 0 }] }))).rows[0] as {
    write_count: number; edit_count: number; archive_count: number;
  };

  const ideasCountRes = await db.execute(sql`
    SELECT COUNT(*)::int AS c FROM video_ideas
    WHERE recorded = false AND (ideation_status IS NULL OR ideation_status != 'archived')
  `).catch(() => ({ rows: [{ c: 0 }] }));
  const ideasCount = (ideasCountRes.rows[0] as { c: number }).c;

  const metricsCountRes = await db.execute(sql`
    SELECT COUNT(DISTINCT instagram_metrics_id)::int AS c
    FROM video_rewrites WHERE status = 'pending'
  `).catch(() => ({ rows: [{ c: 0 }] }));
  const metricsCount = (metricsCountRes.rows[0] as { c: number }).c;

  const viewSql =
    view === "spiked" ? sql`WHERE surfaced IS TRUE`
    : view === "all" ? sql`WHERE TRUE`
    : sql`WHERE surfaced IS NOT TRUE`;

  // platforms is a text[]; "x" and "twitter" both mean X
  const platformSql =
    platform === "x" ? sql`AND (platforms && ARRAY['x','twitter'])`
    : platform === "reddit" ? sql`AND (platforms && ARRAY['reddit'])`
    : sql``;

  const qSql = q ? sql`AND (summary ILIKE ${"%" + q + "%"} OR react_angle ILIKE ${"%" + q + "%"})` : sql``;

  const orderSql =
    sort === "buzz" ? sql`ORDER BY buzz_count DESC NULLS LAST, interest_score DESC NULLS LAST`
    : sort === "recent" ? sql`ORDER BY created_at DESC, id DESC`
    : sql`ORDER BY interest_score DESC NULLS LAST, buzz_count DESC NULLS LAST`;

  const storiesResult = await db.execute(sql`
    SELECT id, story_date, summary, react_angle, interest_score, buzz_count, platforms, top_url, surfaced
    FROM buzz_stories
    ${viewSql}
    ${platformSql}
    ${qSql}
    ${orderSql}
    LIMIT 200
  `).catch(() => ({ rows: [] }));
  const stories = storiesResult.rows as BuzzStory[];

  // peak buzz across the whole tape, to scale the heat meters
  const peakRes = await db.execute(sql`SELECT COALESCE(MAX(buzz_count), 1)::int AS m FROM buzz_stories`)
    .catch(() => ({ rows: [{ m: 1 }] }));
  const peakBuzz = Math.max(1, (peakRes.rows[0] as { m: number }).m);

  const wireDate = stories[0]?.story_date
    ? new Date(stories[0].story_date as string).toLocaleDateString("en-US", {
        weekday: "long", month: "long", day: "numeric",
      })
    : null;

  const buildHref = (overrides: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = { view, platform, sort, q, ...overrides };
    if (merged.view && merged.view !== "wire") params.set("view", merged.view);
    if (merged.platform && merged.platform !== "all") params.set("platform", merged.platform);
    if (merged.sort && merged.sort !== "recent") params.set("sort", merged.sort);
    if (merged.q) params.set("q", merged.q);
    const qs = params.toString();
    return qs ? `/wire?${qs}` : "/wire";
  };

  return (
    <>
      <Topbar
        ideasCount={ideasCount}
        wireCount={counts.wire}
        metricsCount={metricsCount}
        activeTab="wire"
        workspaceTabs={[
          { id: "write", label: "Write", count: ws.write_count, href: "/?tab=write" },
          { id: "edit", label: "Edit", count: ws.edit_count, href: "/?tab=edit" },
          { id: "archive", label: "Archive", count: ws.archive_count, href: "/?tab=archive" },
        ]}
      />

      <main className="main">
        <div className="container">
          <div className="wire-masthead">
            <div className="wire-masthead__left">
              <div className="pagehead__eyebrow">The Wire</div>
              <h1 className="wire-masthead__title">What&rsquo;s buzzing</h1>
              <p className="wire-masthead__sub">
                Today&rsquo;s loudest stories in your corner of the internet, ranked by how much they&rsquo;re moving and
                how reactable they are. Skim the tape, assign what sparks, spike the noise.
              </p>
            </div>
            <div className="wire-masthead__dateline">
              <span className="wire-masthead__datelabel">Edition</span>
              <span className="wire-masthead__date">{wireDate ?? "—"}</span>
              <span className="wire-masthead__rule" />
              <span className="wire-masthead__live"><span className="wire-masthead__livedot" /> {counts.wire} on the wire</span>
            </div>
          </div>

          <div className="wire-controls">
            <div className="segmented" role="tablist" aria-label="View filter">
              <Link href={buildHref({ view: "wire" })} className={"segmented__btn segmented__btn--fresh" + (view === "wire" ? " segmented__btn--on" : "")}>
                <span className="segmented__dot" /> On the wire <span className="seg-count">{counts.wire}</span>
              </Link>
              <Link href={buildHref({ view: "spiked" })} className={"segmented__btn segmented__btn--archived" + (view === "spiked" ? " segmented__btn--on" : "")}>
                <span className="segmented__dot" /> Spiked <span className="seg-count">{counts.spiked}</span>
              </Link>
              <Link href={buildHref({ view: "all" })} className={"segmented__btn" + (view === "all" ? " segmented__btn--on" : "")}>
                All <span className="seg-count">{counts.total}</span>
              </Link>
            </div>

            <form className="search-wrap" action="/wire" method="get">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.4" />
                <path d="M11 11 L14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              <input type="search" name="q" defaultValue={q} placeholder="Search the tape…" />
              {view !== "wire" && <input type="hidden" name="view" value={view} />}
              {platform !== "all" && <input type="hidden" name="platform" value={platform} />}
              {sort !== "recent" && <input type="hidden" name="sort" value={sort} />}
            </form>

            <span className="filterrow__spacer" />

            <div className="wire-source-filter" role="group" aria-label="Source">
              <Link href={buildHref({ platform: "all" })} className={"sourcepill" + (platform === "all" ? " sourcepill--on" : "")}>All sources</Link>
              <Link href={buildHref({ platform: "x" })} className={"sourcepill" + (platform === "x" ? " sourcepill--on" : "")}>X</Link>
              <Link href={buildHref({ platform: "reddit" })} className={"sourcepill" + (platform === "reddit" ? " sourcepill--on" : "")}>Reddit</Link>
            </div>

            <span className="wire-ctrl-sep" />

            <span className="filterrow__sortlabel">Rank by</span>
            <Link href={buildHref({ sort: "score" })} className={"sortpill" + (sort === "score" ? " sortpill--on" : "")}>Interest</Link>
            <Link href={buildHref({ sort: "buzz" })} className={"sortpill" + (sort === "buzz" ? " sortpill--on" : "")}>Buzz</Link>
            <Link href={buildHref({ sort: "recent" })} className={"sortpill" + (sort === "recent" ? " sortpill--on" : "")}>Newest</Link>
          </div>

          <WireClient stories={stories} peakBuzz={peakBuzz} showLead={view !== "spiked" && sort === "score"} />

          <footer className="footer">
            <span className="footer__line" />
            <span className="footer__txt">
              {counts.wire} live on the wire · {counts.spiked} spiked · {counts.total} crawled this edition
            </span>
          </footer>
        </div>
      </main>
    </>
  );
}
