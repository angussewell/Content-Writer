"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { scripts, intros, contextItems, suggestions, scriptImages } from "@/db/schema";
import { eq, notInArray, and, desc, sql } from "drizzle-orm";

export async function login(_prevState: unknown, formData: FormData) {
    const password = formData.get("password") as string;
    const correctPassword = process.env.AUTH_PASSWORD;

    if (password === correctPassword) {
        (await cookies()).set("auth", "true", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            path: "/",
            maxAge: 60 * 60 * 24 * 7, // 1 week
        });
        redirect("/");
    } else {
        return { error: "Invalid password" };
    }
}

export async function createScript() {
    const [newScript] = await db
        .insert(scripts)
        .values({
            title: "",
            body: "",
        })
        .returning({ id: scripts.id });

    redirect(`/${newScript.id}`);
}

type ScriptIntroInput = {
    id: string;
    titleHook: string;
    verbalIntro: string;
};

type ScriptContextInput = {
    id: string;
    content: string;
};

export async function updateScript(id: string, data: {
    title: string;
    body?: string;
    intros: ScriptIntroInput[];
    contextItems?: ScriptContextInput[];
    status?: "draft" | "filmed" | "done" | "archived";
}) {
    console.log(`[updateScript] Received request for ID: ${id}`);

    await db.update(scripts).set({
        title: data.title,
        // Flat body is retired (decision #118); the editor no longer sends it.
        // Only write body if a caller still provides it, so existing content is
        // left intact rather than wiped to empty.
        ...(data.body !== undefined ? { body: data.body } : {}),
        ...(data.status ? { status: data.status } : {}),
        updatedAt: new Date()
    }).where(eq(scripts.id, id));

    // Handle Intros
    const allInputIntroIds = data.intros.map(i => i.id);

    if (allInputIntroIds.length > 0) {
        await db.delete(intros).where(
            and(
                eq(intros.scriptId, id),
                notInArray(intros.id, allInputIntroIds)
            )
        );
    } else {
        await db.delete(intros).where(eq(intros.scriptId, id));
    }

    for (const intro of data.intros) {
        await db
            .insert(intros)
            .values({
                id: intro.id,
                scriptId: id,
                titleHook: intro.titleHook,
                verbalIntro: intro.verbalIntro,
            })
            .onConflictDoUpdate({
                target: intros.id,
                set: {
                    titleHook: intro.titleHook,
                    verbalIntro: intro.verbalIntro,
                },
            });
    }

    // Handle Context Items
    console.log(`[updateScript] Processing contextItems. Payload present: ${!!data.contextItems}, Item count: ${data.contextItems?.length}`);

    // Handle Context Items (Scorched Earth Strategy: Delete all, then re-insert active ones)
    console.log(`[updateScript] Scorched Earth: Deleting all context items for script ${id}`);

    // 1. Delete ALL context items for this script
    await db.delete(contextItems).where(eq(contextItems.scriptId, id));

    // 2. Insert the ones that are currently in the payload
    if (data.contextItems && data.contextItems.length > 0) {
        console.log(`[updateScript] Inserting ${data.contextItems.length} context items`);

        // Prepare values for bulk insert
        const valuesToInsert = data.contextItems.map((item) => ({
            id: item.id,
            scriptId: id,
            content: item.content,
        }));

        await db.insert(contextItems).values(valuesToInsert);
    } else {
        console.log(`[updateScript] No context items in payload to insert.`);
    }
}


export async function deleteScript(id: string) {
    await db.delete(scripts).where(eq(scripts.id, id));
    redirect("/");
}

// ── Script lines (decision #118: line-by-line body) ───────────────────────
// Frontend equivalent of the Content Agent MCP Add_Line / Update_Line /
// Delete_Line tools — same script_lines / line_notes rows, written directly
// the way every other write in this app is (server action → Postgres).

type LineRow = {
    id: string;
    position: number;
    say: string | null;
    on_screen: string | null;
    rationale: string | null;
};

// Structural line edits keep positions as the consecutive integers 1..N.
// Rows are parked at unique negative positions while the gap is opened, which
// avoids collisions with the UNIQUE (script_id, position) constraint. The
// per-script advisory lock prevents two mobile taps from racing each other.
export async function addScriptLine(
    scriptId: string,
    anchorLineId?: string | null,
    placement: "before" | "after" | "end" = "end"
) {
    if (!(["before", "after", "end"] as const).includes(placement)) {
        return { error: "Invalid insertion point" };
    }

    let row: LineRow | undefined;
    let anchorMissing = false;

    await db.transaction(async (tx) => {
        await tx.execute(sql`
            SELECT pg_advisory_xact_lock(hashtextextended(${scriptId}::text, 0))
        `);

        const countResult = await tx.execute(sql`
            SELECT COUNT(*)::int AS count
            FROM script_lines
            WHERE script_id = ${scriptId}::uuid
        `);
        const count = Number((countResult.rows[0] as { count: number }).count);
        let insertAt = count + 1;

        if (placement !== "end") {
            if (!anchorLineId) {
                anchorMissing = true;
                return;
            }
            const anchorResult = await tx.execute(sql`
                SELECT ordinal FROM (
                    SELECT id, ROW_NUMBER() OVER (ORDER BY position, id)::int AS ordinal
                    FROM script_lines
                    WHERE script_id = ${scriptId}::uuid
                ) ranked
                WHERE id = ${anchorLineId}::uuid
            `);
            if (!anchorResult.rows[0]) {
                anchorMissing = true;
                return;
            }
            const anchorOrdinal = Number((anchorResult.rows[0] as { ordinal: number }).ordinal);
            insertAt = placement === "before" ? anchorOrdinal : anchorOrdinal + 1;
        }

        await tx.execute(sql`
            WITH ranked AS (
                SELECT id, ROW_NUMBER() OVER (ORDER BY position, id) AS ordinal
                FROM script_lines
                WHERE script_id = ${scriptId}::uuid
            )
            UPDATE script_lines AS line
            SET position = -1000000000 - ranked.ordinal
            FROM ranked
            WHERE line.id = ranked.id
        `);

        const inserted = await tx.execute(sql`
            INSERT INTO script_lines (script_id, position, say, on_screen, rationale)
            VALUES (${scriptId}::uuid, ${insertAt}, '', '', '')
            RETURNING id, position, say, on_screen, rationale
        `);

        await tx.execute(sql`
            UPDATE script_lines
            SET position = CASE
                    WHEN (-position - 1000000000) >= ${insertAt}
                        THEN (-position - 1000000000) + 1
                    ELSE (-position - 1000000000)
                END,
                updated_at = now()
            WHERE script_id = ${scriptId}::uuid
              AND position < -1000000000
        `);

        row = inserted.rows[0] as LineRow;
    });

    if (anchorMissing || !row) return { error: "Insertion point no longer exists" };
    revalidatePath(`/${scriptId}`);
    return { success: true, line: { ...row, position: Number(row.position) } };
}

const EDITABLE_LINE_FIELDS = new Set(["say", "on_screen", "rationale"]);

export async function updateScriptLine(
    lineId: string,
    scriptId: string,
    field: "say" | "on_screen" | "rationale",
    value: string
) {
    if (!EDITABLE_LINE_FIELDS.has(field)) return { error: "Field not editable" };
    // `field` is validated against the whitelist above, so sql.raw is safe here.
    await db.execute(sql`
        UPDATE script_lines
        SET ${sql.raw(field)} = ${value}, updated_at = now()
        WHERE id = ${lineId}::uuid AND script_id = ${scriptId}::uuid
    `);
    revalidatePath(`/${scriptId}`);
    return { success: true };
}

export async function deleteScriptLine(lineId: string, scriptId: string) {
    let deleted = false;
    await db.transaction(async (tx) => {
        await tx.execute(sql`
            SELECT pg_advisory_xact_lock(hashtextextended(${scriptId}::text, 0))
        `);

        // line_notes cascade-delete via FK.
        const result = await tx.execute(sql`
            DELETE FROM script_lines
            WHERE id = ${lineId}::uuid AND script_id = ${scriptId}::uuid
            RETURNING id
        `);
        if (!result.rows[0]) return;
        deleted = true;

        await tx.execute(sql`
            WITH ranked AS (
                SELECT id, ROW_NUMBER() OVER (ORDER BY position, id) AS ordinal
                FROM script_lines
                WHERE script_id = ${scriptId}::uuid
            )
            UPDATE script_lines AS line
            SET position = -1000000000 - ranked.ordinal
            FROM ranked
            WHERE line.id = ranked.id
        `);
        await tx.execute(sql`
            UPDATE script_lines
            SET position = -position - 1000000000,
                updated_at = now()
            WHERE script_id = ${scriptId}::uuid
              AND position < -1000000000
        `);
    });

    if (deleted) revalidatePath(`/${scriptId}`);
    return { success: deleted };
}

export async function addLineNote(
    lineId: string,
    scriptId: string,
    author: "human" | "ai",
    content: string
) {
    if (!content.trim()) return { error: "Note cannot be empty" };
    const safeAuthor = author === "ai" ? "ai" : "human";
    const res = await db.execute(sql`
        INSERT INTO line_notes (line_id, script_id, author, content)
        VALUES (${lineId}::uuid, ${scriptId}::uuid, ${safeAuthor}, ${content.trim()})
        RETURNING id, author, content, addressed_at, created_at
    `);
    revalidatePath(`/${scriptId}`);
    return { success: true, note: res.rows[0] };
}

export async function updateLineNote(noteId: string, scriptId: string, content: string) {
    if (!content.trim()) return { error: "Note cannot be empty" };
    await db.execute(sql`
        UPDATE line_notes SET content = ${content.trim()}
        WHERE id = ${noteId}::uuid AND script_id = ${scriptId}::uuid
    `);
    revalidatePath(`/${scriptId}`);
    return { success: true };
}

export async function setLineNoteAddressed(noteId: string, scriptId: string, addressed: boolean) {
    await db.execute(sql`
        UPDATE line_notes
        SET addressed_at = ${addressed ? sql`now()` : sql`NULL`}
        WHERE id = ${noteId}::uuid AND script_id = ${scriptId}::uuid
    `);
    revalidatePath(`/${scriptId}`);
    return { success: true };
}

export async function deleteLineNote(noteId: string, scriptId: string) {
    await db.execute(sql`
        DELETE FROM line_notes WHERE id = ${noteId}::uuid AND script_id = ${scriptId}::uuid
    `);
    revalidatePath(`/${scriptId}`);
    return { success: true };
}

export async function updateScriptStatus(id: string, status: "draft" | "filmed" | "done" | "archived") {
    await db.update(scripts).set({ status }).where(eq(scripts.id, id));
    revalidatePath("/");
    revalidatePath(`/${id}`);
}

export async function generateSuggestion(introId: string, type: "hook" | "intro", currentText: string) {
    console.log(`[generateSuggestion] Request for intro ${introId} (${type})`);

    try {
        const [intro] = await db.select().from(intros).where(eq(intros.id, introId));
        if (!intro) {
            return { error: "Intro not found. Please save the script first." };
        }

        const scriptContext = await db.select().from(contextItems).where(eq(contextItems.scriptId, intro.scriptId));
        const contextString = scriptContext.map(c => c.content).join("\n");

        const url = type === "hook"
            ? "https://n8n-n8n.swl3bc.easypanel.host/webhook/2db50814-2bc7-4a4d-b6ae-58719c31a5bc"
            : "https://n8n-n8n.swl3bc.easypanel.host/webhook/6b089b63-a98e-414b-86bd-40ea686bfe0e";

        console.log("Calling n8n:", url);

        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                current_text: currentText,
                context: contextString,
            }),
            signal: AbortSignal.timeout(30000) // 30s timeout
        });

        if (!response.ok) {
            throw new Error(`N8n error: ${response.statusText}`);
        }

        const data = await response.json();
        console.log("N8n response:", data);

        await db.insert(suggestions).values({
            introId,
            type,
            score: typeof data.score === 'number' ? data.score : 0,
            content: data,
        });

        revalidatePath(`/${intro.scriptId}`);
        return { success: true, data };

    } catch (error) {
        console.error("Generate suggestion failed:", error);
        return { error: "Failed to generate suggestion" };
    }
}

export async function getSuggestions(introId: string, type: "hook" | "intro") {
    return await db.select()
        .from(suggestions)
        .where(and(eq(suggestions.introId, introId), eq(suggestions.type, type)))
        .orderBy(desc(suggestions.createdAt));
}

export async function applySuggestion(introId: string, type: "hook" | "intro", content: string) {
    const [intro] = await db.select().from(intros).where(eq(intros.id, introId));

    if (type === "hook") {
        await db.update(intros).set({ titleHook: content }).where(eq(intros.id, introId));
    } else {
        await db.update(intros).set({ verbalIntro: content }).where(eq(intros.id, introId));
    }

    if (intro) {
        revalidatePath(`/${intro.scriptId}`);
    } else {
        revalidatePath("/");
    }
}

export async function generateScriptImage(scriptId: string, customPrompt?: string) {
    console.log(`[generateScriptImage] Request for script ${scriptId}`);

    try {
        const [script] = await db.select().from(scripts).where(eq(scripts.id, scriptId));
        if (!script) return { error: "Script not found" };

        const scriptIntros = await db.select().from(intros).where(eq(intros.scriptId, scriptId));
        const scriptContext = await db.select().from(contextItems).where(eq(contextItems.scriptId, scriptId));

        const fullScriptContext = `
Title: ${script.title}
Body: ${script.body}
Intros: ${scriptIntros.map(i => `- ${i.verbalIntro}`).join("\n")}
Context: ${scriptContext.map(c => `- ${c.content}`).join("\n")}
        `;

        const webhookUrl = "https://n8n-n8n.swl3bc.easypanel.host/webhook/7f2ceb00-7c0e-4034-9e61-637aabf71354";

        const response = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                script_id: scriptId,
                script_text: fullScriptContext,
                custom_prompt: customPrompt
            }),
            // Short timeout since we just want to ensure it was received
            signal: AbortSignal.timeout(5000)
        });

        if (!response.ok) {
            throw new Error(`N8n error: ${response.statusText}`);
        }

        // Fire-and-forget: n8n handles the DB insertion now.
        console.log(`[generateScriptImage] Webhook triggered successfully for ${scriptId}`);

        return { success: true, message: "Generation queued" };

    } catch (error) {
        console.error("Trigger generate image failed:", error);
        return { error: "Failed to trigger generation" };
    }
}

export async function deleteScriptImage(imageId: string) {
    try {
        await db.delete(scriptImages).where(eq(scriptImages.id, imageId));
        return { success: true };
    } catch {
        return { error: "Failed to delete image" };
    }
}

export async function saveFeedback(scriptId: string, content: string) {
    if (!content.trim()) {
        return { error: "Feedback cannot be empty" };
    }

    const result = await db.execute(sql`
        INSERT INTO script_feedback (script_id, content, round_number)
        SELECT ${scriptId}::uuid, ${content}, COALESCE(MAX(round_number), 0) + 1
        FROM script_feedback
        WHERE script_id = ${scriptId}::uuid
        RETURNING id, round_number, created_at
    `);
    const inserted = result.rows[0];

    await db.execute(sql`
        UPDATE scripts
        SET edit_status = 'needs_ai_edit', updated_at = now()
        WHERE id = ${scriptId}::uuid
          AND edit_status = 'idle'
    `);

    revalidatePath(`/${scriptId}`);
    revalidatePath("/");
    return { success: true, feedback: inserted };
}

export async function forceReleaseEditClaim(scriptId: string) {
    await db.execute(sql`
        UPDATE scripts
        SET edit_status = 'needs_ai_edit',
            edit_claimed_at = NULL,
            edit_claimed_by = NULL,
            updated_at = now()
        WHERE id = ${scriptId}::uuid
          AND edit_status = 'ai_editing'
    `);
    revalidatePath(`/${scriptId}`);
    revalidatePath("/");
    return { success: true };
}

export async function deleteFeedback(feedbackId: string, scriptId: string) {
    await db.execute(sql`
        DELETE FROM script_feedback
        WHERE id = ${feedbackId}::uuid
          AND addressed_at IS NULL
    `);
    revalidatePath(`/${scriptId}`);
    return { success: true };
}

export async function archiveVideoIdea(id: string) {
    await db.execute(sql`
        UPDATE video_ideas
        SET ideation_status = 'archived', updated_at = now()
        WHERE id = ${id}::uuid
    `);
    revalidatePath("/ideas");
    return { success: true };
}

export async function restoreVideoIdea(id: string) {
    await db.execute(sql`
        UPDATE video_ideas
        SET ideation_status = 'pending', updated_at = now()
        WHERE id = ${id}::uuid
    `);
    revalidatePath("/ideas");
    return { success: true };
}

export async function updateVideoIdeaTranscript(id: string, transcript: string) {
    await db.execute(sql`
        UPDATE video_ideas
        SET transcript = ${transcript}, updated_at = now()
        WHERE id = ${id}::uuid
    `);
    revalidatePath(`/ideas/${id}`);
    revalidatePath("/ideas");
    return { success: true };
}

export async function spikeBuzzStory(id: number) {
    await db.execute(sql`
        UPDATE buzz_stories SET surfaced = true WHERE id = ${id}
    `);
    revalidatePath("/wire");
    return { success: true };
}

export async function restoreBuzzStory(id: number) {
    await db.execute(sql`
        UPDATE buzz_stories SET surfaced = false WHERE id = ${id}
    `);
    revalidatePath("/wire");
    return { success: true };
}

export async function archiveYoutubeIdea(id: string) {
    await db.execute(sql`
        UPDATE youtube_ideas
        SET archived_at = now(), updated_at = now()
        WHERE id = ${id}::uuid
    `);
    revalidatePath("/ideas");
    revalidatePath(`/ideas/youtube/${id}`);
    return { success: true };
}

export async function restoreYoutubeIdea(id: string) {
    await db.execute(sql`
        UPDATE youtube_ideas
        SET archived_at = NULL, updated_at = now()
        WHERE id = ${id}::uuid
    `);
    revalidatePath("/ideas");
    revalidatePath(`/ideas/youtube/${id}`);
    return { success: true };
}

export async function updateYoutubeNotes(id: string, notes: string) {
    await db.execute(sql`
        UPDATE youtube_ideas
        SET notes = ${notes}, updated_at = now()
        WHERE id = ${id}::uuid
    `);
    revalidatePath(`/ideas/youtube/${id}`);
    return { success: true };
}

export async function updateYoutubeThumbnailNotes(id: string, thumbnailNotes: string) {
    await db.execute(sql`
        UPDATE youtube_ideas
        SET thumbnail_notes = NULLIF(${thumbnailNotes}, ''), updated_at = now()
        WHERE id = ${id}::uuid
    `);
    revalidatePath(`/youtube/${id}`);
    return { success: true };
}

export async function updateYoutubeTitle(id: string, title: string) {
    const clean = title.trim() || "Untitled concept";
    await db.execute(sql`
        UPDATE youtube_ideas
        SET title = ${clean}, updated_at = now()
        WHERE id = ${id}::uuid
    `);
    revalidatePath("/ideas");
    revalidatePath(`/ideas/youtube/${id}`);
    return { success: true, title: clean };
}

const YT_STAGES = ["idea", "prepped", "filmed", "posted"] as const;
export async function updateYoutubeStage(id: string, stage: string) {
    if (!YT_STAGES.includes(stage as (typeof YT_STAGES)[number])) {
        return { success: false };
    }
    await db.execute(sql`
        UPDATE youtube_ideas
        SET status = ${stage}, updated_at = now()
        WHERE id = ${id}::uuid
    `);
    revalidatePath("/ideas");
    revalidatePath(`/ideas/youtube/${id}`);
    return { success: true };
}

// ── YouTube film sections (issue #2790: sectioned script model) ───────────
// One row per beat/section of a long-form YouTube video, keyed to
// youtube_ideas.id. position is UNIQUE per concept, so every structural
// change (insert-between, reorder) runs in a transaction and parks rows on
// negative positions first — negatives never collide with real positions.

type FilmSectionRow = {
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

function revalidateFilmScript(ideaId: string) {
    revalidatePath("/youtube");
    revalidatePath(`/youtube/${ideaId}`);
}

// Add a section. With no `afterSectionId` it appends (position = max+1); with
// one, it opens a gap by parking every later section on -(position+1),
// inserting at p+1, then flipping the parked rows back to their shifted spot.
export async function addFilmSection(ideaId: string, afterSectionId?: string | null) {
    let row: FilmSectionRow | undefined;
    await db.transaction(async (tx) => {
        if (afterSectionId) {
            const aft = await tx.execute(sql`
                SELECT position FROM youtube_film_sections
                WHERE id = ${afterSectionId}::uuid AND youtube_idea_id = ${ideaId}::uuid
            `);
            const p = aft.rows[0] ? Number((aft.rows[0] as { position: number }).position) : null;
            if (p === null) {
                afterSectionId = null;
            } else {
                await tx.execute(sql`
                    UPDATE youtube_film_sections SET position = -(position + 1)
                    WHERE youtube_idea_id = ${ideaId}::uuid AND position > ${p}
                `);
                const ins = await tx.execute(sql`
                    INSERT INTO youtube_film_sections (youtube_idea_id, position, label)
                    VALUES (${ideaId}::uuid, ${p + 1}, '')
                    RETURNING id, position, label, intent, planned_beats, target_seconds,
                              on_screen, say, retention_device, status, filmed_note, filmed_at
                `);
                await tx.execute(sql`
                    UPDATE youtube_film_sections SET position = -position
                    WHERE youtube_idea_id = ${ideaId}::uuid AND position < 0
                `);
                row = ins.rows[0] as FilmSectionRow;
            }
        }
        if (!afterSectionId) {
            const ins = await tx.execute(sql`
                INSERT INTO youtube_film_sections (youtube_idea_id, position, label)
                SELECT ${ideaId}::uuid, COALESCE(MAX(position), 0) + 1, ''
                FROM youtube_film_sections WHERE youtube_idea_id = ${ideaId}::uuid
                RETURNING id, position, label, intent, planned_beats, target_seconds,
                          on_screen, say, retention_device, status, filmed_note, filmed_at
            `);
            row = ins.rows[0] as FilmSectionRow;
        }
    });
    if (!row) return { error: "Couldn't add section" };
    revalidateFilmScript(ideaId);
    return { success: true, section: { ...row, position: Number(row.position) } };
}

const EDITABLE_SECTION_FIELDS = new Set([
    "label", "intent", "planned_beats", "on_screen", "say", "retention_device", "filmed_note",
]);

export async function updateFilmSectionField(
    sectionId: string,
    ideaId: string,
    field: "label" | "intent" | "planned_beats" | "on_screen" | "say" | "retention_device" | "filmed_note",
    value: string
) {
    if (!EDITABLE_SECTION_FIELDS.has(field)) return { error: "Field not editable" };
    // `field` is validated against the whitelist above, so sql.raw is safe here.
    await db.execute(sql`
        UPDATE youtube_film_sections
        SET ${sql.raw(field)} = ${value}, updated_at = now()
        WHERE id = ${sectionId}::uuid AND youtube_idea_id = ${ideaId}::uuid
    `);
    revalidateFilmScript(ideaId);
    return { success: true };
}

export async function updateFilmSectionSeconds(sectionId: string, ideaId: string, seconds: number | null) {
    const clean = seconds === null || !Number.isFinite(seconds) ? null : Math.max(0, Math.round(seconds));
    await db.execute(sql`
        UPDATE youtube_film_sections
        SET target_seconds = ${clean}, updated_at = now()
        WHERE id = ${sectionId}::uuid AND youtube_idea_id = ${ideaId}::uuid
    `);
    revalidateFilmScript(ideaId);
    return { success: true, seconds: clean };
}

export async function setFilmSectionFilmed(sectionId: string, ideaId: string, filmed: boolean) {
    await db.execute(sql`
        UPDATE youtube_film_sections
        SET status = ${filmed ? "filmed" : "unfilmed"},
            filmed_at = ${filmed ? sql`now()` : sql`NULL`},
            updated_at = now()
        WHERE id = ${sectionId}::uuid AND youtube_idea_id = ${ideaId}::uuid
    `);
    revalidateFilmScript(ideaId);
    return { success: true };
}

// Swap a section with its neighbor. Positions are read inside the
// transaction (never trusted from the client) and the move goes through a
// temporary -1 so the UNIQUE (youtube_idea_id, position) never trips.
export async function moveFilmSection(sectionId: string, ideaId: string, dir: "up" | "down") {
    let moved = false;
    await db.transaction(async (tx) => {
        const cur = await tx.execute(sql`
            SELECT position FROM youtube_film_sections
            WHERE id = ${sectionId}::uuid AND youtube_idea_id = ${ideaId}::uuid
        `);
        if (!cur.rows[0]) return;
        const p = Number((cur.rows[0] as { position: number }).position);
        const neighbor = await tx.execute(
            dir === "up"
                ? sql`SELECT id, position FROM youtube_film_sections
                      WHERE youtube_idea_id = ${ideaId}::uuid AND position < ${p}
                      ORDER BY position DESC LIMIT 1`
                : sql`SELECT id, position FROM youtube_film_sections
                      WHERE youtube_idea_id = ${ideaId}::uuid AND position > ${p}
                      ORDER BY position ASC LIMIT 1`
        );
        if (!neighbor.rows[0]) return;
        const n = neighbor.rows[0] as { id: string; position: number };
        const np = Number(n.position);
        await tx.execute(sql`
            UPDATE youtube_film_sections SET position = -1
            WHERE id = ${sectionId}::uuid AND youtube_idea_id = ${ideaId}::uuid
        `);
        await tx.execute(sql`
            UPDATE youtube_film_sections SET position = ${p}, updated_at = now()
            WHERE id = ${n.id}::uuid AND youtube_idea_id = ${ideaId}::uuid
        `);
        await tx.execute(sql`
            UPDATE youtube_film_sections SET position = ${np}, updated_at = now()
            WHERE id = ${sectionId}::uuid AND youtube_idea_id = ${ideaId}::uuid
        `);
        moved = true;
    });
    if (moved) revalidateFilmScript(ideaId);
    return { success: moved };
}

export async function deleteFilmSection(sectionId: string, ideaId: string) {
    // Positions may keep gaps after a delete — ORDER BY position still holds.
    await db.execute(sql`
        DELETE FROM youtube_film_sections
        WHERE id = ${sectionId}::uuid AND youtube_idea_id = ${ideaId}::uuid
    `);
    revalidateFilmScript(ideaId);
    return { success: true };
}

// ── Metrics (posted reels) ───────────────────────────────────────────────

// Whitelist of inline-editable instagram_metrics columns + their coercion type.
const EDITABLE_METRIC_FIELDS: Record<string, "int" | "text" | "bool" | "numeric"> = {
    follows_generated: "int",
    analyst_notes: "text",
    is_trial_reel: "bool",
    reach: "int",
    likes: "int",
    comments: "int",
    shares: "int",
    saves: "int",
    avg_watch_time: "int",
    skip_rate: "numeric",
};

export async function updateMetricField(
    id: number,
    field: string,
    rawValue: string | boolean | null
) {
    const type = EDITABLE_METRIC_FIELDS[field];
    if (!type) return { error: "Field not editable" };

    let value: number | string | boolean | null;
    if (type === "bool") {
        value = rawValue === true || rawValue === "true";
    } else if (rawValue === null || rawValue === "") {
        value = null;
    } else if (type === "int") {
        const n = parseInt(String(rawValue), 10);
        value = Number.isFinite(n) ? n : null;
    } else if (type === "numeric") {
        const n = parseFloat(String(rawValue));
        value = Number.isFinite(n) ? String(n) : null;
    } else {
        value = String(rawValue);
    }

    // `field` is validated against the whitelist above, so sql.raw is safe here.
    await db.execute(sql`
        UPDATE instagram_metrics
        SET ${sql.raw(field)} = ${value}, updated_at = now()
        WHERE id = ${id}
    `);
    revalidatePath("/metrics");
    revalidatePath(`/metrics/${id}`);
    return { success: true, value };
}

export async function createRewrite(
    instagramMetricsId: number,
    rewriteRequest: string,
    title?: string
) {
    if (!rewriteRequest.trim()) return { error: "Rewrite request cannot be empty" };
    const res = await db.execute(sql`
        INSERT INTO video_rewrites (instagram_metrics_id, rewrite_request, title, status)
        VALUES (${instagramMetricsId}, ${rewriteRequest.trim()}, ${title?.trim() || null}, 'pending')
        RETURNING id
    `);
    revalidatePath(`/metrics/${instagramMetricsId}`);
    revalidatePath("/metrics");
    return { success: true, id: (res.rows[0] as { id: number }).id };
}

export async function updateRewrite(
    id: number,
    instagramMetricsId: number,
    rewriteRequest: string,
    title?: string
) {
    if (!rewriteRequest.trim()) return { error: "Rewrite request cannot be empty" };
    // Only pending rewrites can be edited.
    await db.execute(sql`
        UPDATE video_rewrites
        SET rewrite_request = ${rewriteRequest.trim()}, title = ${title?.trim() || null}, updated_at = now()
        WHERE id = ${id} AND status = 'pending'
    `);
    revalidatePath(`/metrics/${instagramMetricsId}`);
    revalidatePath("/metrics");
    return { success: true };
}

export async function deleteRewrite(id: number, instagramMetricsId: number) {
    await db.execute(sql`DELETE FROM video_rewrites WHERE id = ${id}`);
    revalidatePath(`/metrics/${instagramMetricsId}`);
    revalidatePath("/metrics");
    return { success: true };
}

type InspirationHookInput = {
    sourceUrl: string;
    creatorHandle: string;
    firstSentence: string;
    secondSentence: string;
    onScreenText: string;
    openingVisual: string;
    notes: string;
};

function isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function updateInspirationHook(id: string, input: InspirationHookInput) {
    if (!isUuid(id)) return { success: false as const, error: "Invalid hook ID." };

    const sourceUrl = input.sourceUrl.trim();
    const creatorHandle = input.creatorHandle.trim().replace(/^@/, "");
    const firstSentence = input.firstSentence.trim();
    const openingVisual = input.openingVisual.trim();

    if (!sourceUrl || !creatorHandle || !firstSentence || !openingVisual) {
        return { success: false as const, error: "Source, creator, first sentence, and opening visual are required." };
    }

    try {
        const result = await db.execute(sql`
            UPDATE inspiration_hooks
            SET source_url = ${sourceUrl},
                creator_handle = ${creatorHandle},
                first_sentence = ${firstSentence},
                second_sentence = NULLIF(${input.secondSentence.trim()}, ''),
                on_screen_text = NULLIF(${input.onScreenText.trim()}, ''),
                opening_visual = ${openingVisual},
                notes = NULLIF(${input.notes.trim()}, ''),
                updated_at = now()
            WHERE id = ${id}::uuid
            RETURNING updated_at
        `);
        const row = result.rows[0] as { updated_at: Date | string } | undefined;
        if (!row) return { success: false as const, error: "Hook not found." };
        revalidatePath("/inspiration");
        return { success: true as const, updatedAt: new Date(row.updated_at).toISOString() };
    } catch (error) {
        console.error("[updateInspirationHook]", error);
        return { success: false as const, error: "Couldn’t save this hook." };
    }
}

export async function deleteInspirationHook(id: string) {
    if (!isUuid(id)) return { success: false as const, error: "Invalid hook ID." };

    try {
        const result = await db.execute(sql`
            DELETE FROM inspiration_hooks WHERE id = ${id}::uuid RETURNING id
        `);
        if (!result.rows[0]) return { success: false as const, error: "Hook not found." };
        revalidatePath("/inspiration");
        return { success: true as const };
    } catch (error) {
        console.error("[deleteInspirationHook]", error);
        return { success: false as const, error: "Couldn’t delete this hook." };
    }
}
