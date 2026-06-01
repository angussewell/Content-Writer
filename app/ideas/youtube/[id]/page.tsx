import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { YoutubeDetailActions } from "./YoutubeDetailActions";

export const dynamic = "force-dynamic";

type Row = {
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

const STAGE_LABEL: Record<string, string> = {
  idea: "Idea",
  prepped: "Prepped",
  filmed: "Filmed",
  posted: "Posted",
  archived: "Archived",
};

function stageOf(row: Row): keyof typeof STAGE_LABEL {
  if (row.archived_at) return "archived";
  if (row.status === "prepped") return "prepped";
  if (row.status === "filmed") return "filmed";
  if (row.status === "posted") return "posted";
  return "idea";
}

function extractSources(row: Row): string[] {
  const hay = `${row.notes ?? ""}\n${row.description ?? ""}`;
  const matches = hay.match(/https?:\/\/[^\s)|;,]+/gi) ?? [];
  return Array.from(new Set(matches));
}

function fmtDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export default async function YoutubeConceptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const res = await db.execute(sql`
    SELECT id::text AS id, title, description, status, notes, format, hypothesis, result, verdict, lesson,
           filmed_at, archived_at, created_at
    FROM youtube_ideas
    WHERE id = ${id}::uuid
    LIMIT 1
  `).catch(() => ({ rows: [] }));

  const row = res.rows[0] as Row | undefined;
  if (!row) notFound();

  const stage = stageOf(row);
  const sources = extractSources(row);
  const created = fmtDate(row.created_at);
  const filmed = fmtDate(row.filmed_at);

  const fields: { k: string; v: string | null; mono?: boolean }[] = [
    { k: "Hypothesis", v: row.hypothesis },
    { k: "Result", v: row.result, mono: true },
    { k: "Verdict", v: row.verdict },
    { k: "Lesson", v: row.lesson },
  ];

  return (
    <main className="ytd">
      <div className="container ytd__inner">
        <Link href="/ideas?dataset=youtube" className="ytd-back">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 3 L5 7 L9 11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          YouTube concepts
        </Link>

        <div className="ytd-head">
          <div className="ytd-head__meta">
            <span className={`yt-stage yt-stage--${stage}`}>
              <span className="yt-stage__dot" /> {STAGE_LABEL[stage]}
            </span>
            {created && (
              <>
                <span className="sep" />
                <span>Added {created}</span>
              </>
            )}
            {filmed && (
              <>
                <span className="sep" />
                <span>Filmed {filmed}</span>
              </>
            )}
            <span className="sep" />
            <span className="ytd-head__id">#{row.id.replace(/-/g, "").slice(0, 8)}</span>
          </div>

          <h1 className="ytd-title">{row.title}</h1>
          {row.description && <p className="ytd-desc">{row.description}</p>}

          <YoutubeDetailActions id={row.id} title={row.title} archived={!!row.archived_at} />
        </div>

        <div className="ytd-body">
          {row.format && (
            <section className="ytd-section">
              <div className="ytd-section__k">Format</div>
              <p className="ytd-section__v">{row.format}</p>
            </section>
          )}

          {fields.filter((f) => f.v).map((f) => (
            <section key={f.k} className="ytd-section">
              <div className="ytd-section__k">{f.k}</div>
              <p className={"ytd-section__v" + (f.mono ? " ytd-section__v--mono" : "")}>{f.v}</p>
            </section>
          ))}

          {sources.length > 0 && (
            <section className="ytd-section">
              <div className="ytd-section__k">Sources</div>
              <ul className="ytd-sources">
                {sources.map((u) => {
                  let host = u;
                  try {
                    host = new URL(u).hostname.replace(/^www\./, "");
                  } catch {
                    // keep raw
                  }
                  return (
                    <li key={u}>
                      <a href={u} target="_blank" rel="noopener noreferrer">
                        <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                          <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.1" />
                          <path d="M1.5 6 H10.5 M6 1.5 C8 4 8 8 6 10.5 C4 8 4 4 6 1.5" stroke="currentColor" strokeWidth="1.1" />
                        </svg>
                        {host}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {row.notes && (
            <section className="ytd-section">
              <div className="ytd-section__k">Notes</div>
              <p className="ytd-section__v ytd-notes">{row.notes}</p>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
