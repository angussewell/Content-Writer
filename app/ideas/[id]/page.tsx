import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { IdeaDetailClient } from "./IdeaDetailClient";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  transcript: string;
  recorded: boolean;
  ideation_status: string | null;
  script_id: string | null;
  created_at: string;
};

function statusOf(row: Row): "fresh" | "recorded" | "archived" {
  if (row.ideation_status === "archived") return "archived";
  if (row.recorded) return "recorded";
  return "fresh";
}

export default async function IdeaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const res = await db
    .execute(sql`
      SELECT id::text AS id, transcript, recorded, ideation_status,
             script_id::text AS script_id, created_at
      FROM video_ideas
      WHERE id = ${id}::uuid
      LIMIT 1
    `)
    .catch(() => ({ rows: [] }));

  const row = res.rows[0] as Row | undefined;
  if (!row) notFound();

  return (
    <main className="ytd">
      <div className="container ytd__inner">
        <Link href="/ideas" className="ytd-back">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 3 L5 7 L9 11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          The idea notebook
        </Link>

        <IdeaDetailClient
          id={row.id}
          initialTranscript={row.transcript}
          status={statusOf(row)}
          scriptId={row.script_id}
          createdAt={row.created_at}
        />
      </div>
    </main>
  );
}
