import { db } from "@/lib/db";
export const dynamic = "force-dynamic";
import { sql } from "drizzle-orm";
import Link from "next/link";
import { createScript, updateScriptStatus } from "./actions";

function formatDate(date: Date | string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(date));
}

function parseBody(body: string | null) {
  if (!body) return [{ type: "prose", text: "" }];
  const out: { type: "tag" | "prose"; text: string }[] = [];
  const re = /\[([^\]]+)\]/g;
  let last = 0, m;
  while ((m = re.exec(body)) !== null) {
    if (m.index > last) out.push({ type: "prose", text: body.slice(last, m.index) });
    out.push({ type: "tag", text: m[1] });
    last = m.index + m[0].length;
  }
  if (last < body.length) out.push({ type: "prose", text: body.slice(last) });
  return out;
}

type Script = {
  id: string;
  title: string;
  body: string;
  status: string;
  edit_status: string;
  created_at: Date;
  updated_at: Date;
  pending_feedback_count: number;
};

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; feedback?: string; sort?: string }>;
}) {
  const { tab, feedback: feedbackFilter, sort = "recent" } = await searchParams;
  const currentTab = tab || "write";

  // Counts for all tabs
  const countsResult = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'draft') AS write_count,
      COUNT(*) FILTER (WHERE status = 'filmed') AS edit_count,
      COUNT(*) FILTER (WHERE status IN ('done', 'archived')) AS archive_count
    FROM scripts
  `);
  const counts = countsResult.rows[0] as { write_count: number; edit_count: number; archive_count: number };

  // Scripts for current tab
  const statusFilter =
    currentTab === "write"
      ? sql`s.status = 'draft'`
      : currentTab === "edit"
      ? sql`s.status = 'filmed'`
      : sql`s.status IN ('done', 'archived')`;

  const feedbackClause =
    feedbackFilter === "1"
      ? sql`AND ((SELECT COUNT(*) FROM script_feedback sf2 WHERE sf2.script_id = s.id AND sf2.addressed_at IS NULL) > 0 OR s.edit_status != 'idle')`
      : sql``;

  const orderClause =
    sort === "title"
      ? sql`ORDER BY s.title ASC`
      : sql`ORDER BY s.updated_at DESC`;

  const result = await db.execute(sql`
    SELECT s.id, s.title, s.body, s.status, s.edit_status, s.created_at, s.updated_at,
      (SELECT COUNT(*)::int FROM script_feedback sf
       WHERE sf.script_id = s.id AND sf.addressed_at IS NULL) AS pending_feedback_count
    FROM scripts s
    WHERE ${statusFilter}
    ${feedbackClause}
    ${orderClause}
  `);
  const scripts = result.rows as Script[];

  const tabsMeta = [
    { id: "write", label: "Write", count: counts.write_count },
    { id: "edit", label: "Edit", count: counts.edit_count },
    { id: "archive", label: "Archive", count: counts.archive_count },
  ];

  const headings: Record<string, { eyebrow: string; title: string; sub: string }> = {
    write: {
      eyebrow: "Workspace",
      title: "Drafts in motion",
      sub: `${counts.write_count} script${counts.write_count === 1 ? "" : "s"} in flight.`,
    },
    edit: {
      eyebrow: "Workspace",
      title: "Filmed. Awaiting polish.",
      sub: "Captions, cuts, and final reads before publish.",
    },
    archive: {
      eyebrow: "Workspace",
      title: "The archive",
      sub: "Everything published, plus the things you let go.",
    },
  };
  const heading = headings[currentTab] ?? headings.write;

  return (
    <>
      {/* Topbar */}
      <header className="topbar">
        <div className="container topbar__row">
          {/* Brand */}
          <div className="topbar__brand">
            <span className="brand__mark" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <path d="M3 19 L13 9 L18 14 L8 19 Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                <path d="M13 9 L17 5 L19 7 L15 11" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                <circle cx="6" cy="16" r="1.1" fill="currentColor" />
              </svg>
            </span>
            <span className="brand__word">Reel Scripter</span>
          </div>

          {/* Tabs */}
          <nav className="tabs" aria-label="Workspace tabs">
            {tabsMeta.map((t) => (
              <Link
                key={t.id}
                href={`/?tab=${t.id}`}
                className={"tab " + (currentTab === t.id ? "tab--active" : "")}
              >
                <span className="tab__label">{t.label}</span>
                <span className="tab__count">{t.count}</span>
              </Link>
            ))}
          </nav>

          {/* Right actions */}
          <div className="topbar__right">
            <button className="iconbtn" title="Search" aria-label="Search">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.4" />
                <path d="M11 11 L14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
            <form action={createScript}>
              <button type="submit" className="cta">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M7 2 V12 M2 7 H12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                <span>New script</span>
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="main">
        <div className="container">
          {/* Page heading */}
          <div className="pagehead">
            <div className="pagehead__eyebrow">{heading.eyebrow}</div>
            <h1 className="pagehead__title">{heading.title}</h1>
            <p className="pagehead__sub">{heading.sub}</p>
          </div>

          {/* Filter row */}
          <div className="filterrow">
            <Link
              href={`/?tab=${currentTab}&sort=${sort}${feedbackFilter === "1" ? "" : "&feedback=1"}`}
              className={"chip " + (feedbackFilter === "1" ? "chip--on" : "")}
            >
              <span className="chip__dot" />
              Feedback loop
            </Link>
            <span className="chip chip--ghost">Last 30 days</span>
            <span className="filterrow__spacer" />
            <span className="filterrow__sortlabel">Sort</span>
            <Link
              href={`/?tab=${currentTab}${feedbackFilter === "1" ? "&feedback=1" : ""}&sort=recent`}
              className={"sortpill " + (sort === "recent" || !sort ? "sortpill--on" : "")}
            >
              Recent
            </Link>
            <Link
              href={`/?tab=${currentTab}${feedbackFilter === "1" ? "&feedback=1" : ""}&sort=title`}
              className={"sortpill " + (sort === "title" ? "sortpill--on" : "")}
            >
              Title
            </Link>
          </div>

          {/* Grid */}
          <div className="grid grid--marginalia">
            {scripts.length === 0 ? (
              <div className="col-span-full" style={{ gridColumn: "1 / -1", padding: "4rem 0", textAlign: "center", color: "var(--ink-3)" }}>
                <p style={{ marginBottom: "1rem" }}>No scripts in {currentTab}.</p>
                {currentTab === "write" && (
                  <form action={createScript} style={{ display: "inline" }}>
                    <button type="submit" style={{ textDecoration: "underline", background: "none", border: "none", cursor: "pointer", color: "var(--ink-2)", fontFamily: "var(--sans)" }}>
                      Create one
                    </button>
                  </form>
                )}
              </div>
            ) : (
              scripts.map((script) => {
                const parts = parseBody(script.body);
                return (
                  <Link key={script.id} href={`/${script.id}`} className="cardlink">
                    <article className="card card--marginalia">
                      <aside className="marg__aside">
                        <div className="marg__date">{formatDate(script.created_at)}</div>
                        <div className="marg__spacer" />
                        <div className="marg__draft">{script.status === "draft" ? "Draft" : script.status === "filmed" ? "Filmed" : "Done"}</div>
                      </aside>
                      <div className="marg__body">
                        <h2 className="card__title card__title--serif">
                          {script.title || "Untitled"}
                        </h2>
                        <div className="card__body">
                          {parts.map((p, i) =>
                            p.type === "tag" ? (
                              <span key={i} className="onscreen-tag">{p.text}</span>
                            ) : (
                              <span key={i}>{p.text}</span>
                            )
                          )}
                        </div>
                        <footer className="card__footer">
                          {script.edit_status === "needs_ai_edit" && (
                            <span className="status-pill status-pill--queued">
                              <span className="status-dot" />
                              AI edit queued
                            </span>
                          )}
                          {script.edit_status === "ai_editing" && (
                            <span className="status-pill status-pill--live">
                              <span className="status-dot status-dot--pulse" />
                              AI editing
                            </span>
                          )}
                          <span className="card__spacer" />
                          {script.pending_feedback_count > 0 && (
                            <span className="card__pending">
                              <span className="pending-dot" />
                              {script.pending_feedback_count} pending
                            </span>
                          )}
                        </footer>
                      </div>
                    </article>
                  </Link>
                );
              })
            )}
          </div>

          {/* Footer */}
          <footer className="footer">
            <span className="footer__line" />
            <span className="footer__txt">
              Reel Scripter — {counts.write_count} draft{counts.write_count === 1 ? "" : "s"}, {counts.edit_count} edit{counts.edit_count === 1 ? "" : "s"}, {counts.archive_count} in the archive.
            </span>
          </footer>
        </div>
      </main>
    </>
  );
}
