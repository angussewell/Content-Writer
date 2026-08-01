import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import FilmSections, { type SectionData } from "@/components/FilmSections";
import ThumbnailSketch from "@/components/ThumbnailSketch";

export const dynamic = "force-dynamic";

type IdeaRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  thumbnail_notes: string | null;
  archived_at: string | null;
  created_at: string;
};

type SectionRow = {
  id: string;
  position: number;
  label: string;
  intent: string | null;
  planned_beats: string | null;
  target_seconds: number | null;
  on_screen: string | null;
  say: string | null;
  retention_device: string | null;
  status: string;
  filmed_note: string | null;
  filmed_at: string | null;
};

type Stage = "idea" | "prepped" | "filmed" | "posted" | "archived";

function stageOf(row: IdeaRow): Stage {
  if (row.archived_at) return "archived";
  if (row.status === "prepped") return "prepped";
  if (row.status === "filmed") return "filmed";
  if (row.status === "posted") return "posted";
  return "idea";
}

const STAGE_LABEL: Record<Stage, string> = {
  idea: "Idea",
  prepped: "Prepped",
  filmed: "Filmed",
  posted: "Posted",
  archived: "Archived",
};

export default async function YoutubeScriptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const ideaRes = await db
    .execute(sql`
      SELECT id::text AS id, title, description, status, thumbnail_notes, archived_at, created_at
      FROM youtube_ideas
      WHERE id = ${id}::uuid
      LIMIT 1
    `)
    .catch(() => ({ rows: [] }));
  const idea = ideaRes.rows[0] as IdeaRow | undefined;
  if (!idea) notFound();

  const sectionsRes = await db
    .execute(sql`
      SELECT id::text AS id, position, label, intent, planned_beats, target_seconds,
             on_screen, say, retention_device, status, filmed_note, filmed_at
      FROM youtube_film_sections
      WHERE youtube_idea_id = ${id}::uuid
      ORDER BY position ASC
    `)
    .catch(() => ({ rows: [] }));

  const sections: SectionData[] = (sectionsRes.rows as SectionRow[]).map((r) => ({
    id: r.id,
    position: Number(r.position),
    label: r.label ?? "",
    intent: r.intent ?? "",
    plannedBeats: r.planned_beats ?? "",
    targetSeconds: r.target_seconds == null ? null : Number(r.target_seconds),
    onScreen: r.on_screen ?? "",
    say: r.say ?? "",
    retentionDevice: r.retention_device ?? "",
    filmed: r.status === "filmed",
    filmedNote: r.filmed_note ?? "",
    filmedAt: r.filmed_at ? String(r.filmed_at) : null,
  }));

  const stage = stageOf(idea);

  return (
    <main className="ytd">
      <div className="container ytd__inner ytd__inner--script">
        <div className="fs-topline">
          <Link href="/youtube" className="ytd-back">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M9 3 L5 7 L9 11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            YouTube scripts
          </Link>
          <Link href={`/ideas/youtube/${idea.id}`} className="fs-brieflink">
            Open brief
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <path d="M4 2.5 H9.5 V8 M9.5 2.5 L3 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>

        <header className="fs-head">
          <div className="ytd2-meta">
            <span className={`yt-stage yt-stage--${stage}`}>
              <span className="yt-stage__dot" /> {STAGE_LABEL[stage]}
            </span>
            <span className="sep" />
            <span>Film script</span>
            <span className="sep" />
            <span className="ytd2-id">#{idea.id.replace(/-/g, "").slice(0, 8)}</span>
          </div>
          <h1 className="fs-title">{idea.title}</h1>
          {idea.description && <p className="fs-desc">{idea.description}</p>}
        </header>

        <ThumbnailSketch ideaId={idea.id} initialNotes={idea.thumbnail_notes ?? ""} />

        <FilmSections ideaId={idea.id} initialSections={sections} />
      </div>
    </main>
  );
}
