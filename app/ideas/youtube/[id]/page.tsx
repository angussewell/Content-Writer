import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { YoutubeDetailClient } from "./YoutubeDetailClient";

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

type Stage = "idea" | "prepped" | "filmed" | "posted" | "archived";

function stageOf(row: Row): Stage {
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

  const res = await db
    .execute(sql`
      SELECT id::text AS id, title, description, status, notes, format, hypothesis, result, verdict, lesson,
             filmed_at, archived_at, created_at
      FROM youtube_ideas
      WHERE id = ${id}::uuid
      LIMIT 1
    `)
    .catch(() => ({ rows: [] }));

  const row = res.rows[0] as Row | undefined;
  if (!row) notFound();

  return (
    <main className="ytd">
      <div className="container ytd__inner">
        <Link href="/ideas?dataset=youtube" className="ytd-back">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 3 L5 7 L9 11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          YouTube concepts
        </Link>

        <YoutubeDetailClient
          id={row.id}
          title={row.title}
          description={row.description}
          stage={stageOf(row)}
          archived={!!row.archived_at}
          notes={row.notes ?? ""}
          format={row.format}
          hypothesis={row.hypothesis}
          result={row.result}
          verdict={row.verdict}
          lesson={row.lesson}
          sources={extractSources(row)}
          createdLabel={fmtDate(row.created_at)}
          filmedLabel={fmtDate(row.filmed_at)}
        />
      </div>
    </main>
  );
}
