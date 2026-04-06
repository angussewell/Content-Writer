import { db } from "@/lib/db";
export const dynamic = "force-dynamic";
import { scripts, intros, contextItems, scriptImages, scriptFeedback } from "@/db/schema";
import { eq, asc, desc } from "drizzle-orm";
import Editor from "@/components/Editor";
import { notFound } from "next/navigation";
import { Toaster } from "sonner";

export default async function ScriptPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    const script = await db.query.scripts.findFirst({
        where: eq(scripts.id, id),
    });

    if (!script) {
        notFound();
    }

    const scriptIntros = await db.query.intros.findMany({
        where: eq(intros.scriptId, id),
        orderBy: asc(intros.createdAt),
    });

    const scriptContextItems = await db.query.contextItems.findMany({
        where: eq(contextItems.scriptId, id),
        orderBy: asc(contextItems.createdAt),
    });

    const scriptImagesData = await db.query.scriptImages.findMany({
        where: eq(scriptImages.scriptId, id),
        orderBy: desc(scriptImages.createdAt),
    });

    const feedbackRows = await db.query.scriptFeedback.findMany({
        where: eq(scriptFeedback.scriptId, id),
        orderBy: asc(scriptFeedback.roundNumber),
    });

    return (
        <>
            <Toaster position="top-center" />
            <Editor
                initialData={{
                    id: script.id,
                    title: script.title,
                    body: script.body || "",
                    status: script.status as any, // Cast to match interface in Editor
                    editStatus: script.editStatus as "idle" | "needs_ai_edit" | "ai_editing",
                    editClaimedAt: script.editClaimedAt,
                    intros: scriptIntros.map((i): any => ({
                        id: i.id,
                        titleHook: i.titleHook || "",
                        verbalIntro: i.verbalIntro || "",
                    })),
                    contextItems: scriptContextItems.map((c): any => ({
                        id: c.id,
                        content: c.content || "",
                    })),
                    scriptImages: scriptImagesData.map((img) => ({
                        id: img.id,
                        imageUrl: img.imageUrl,
                        prompt: img.prompt,
                        createdAt: img.createdAt,
                    })),
                    feedback: feedbackRows.map((f) => ({
                        id: f.id,
                        content: f.content,
                        roundNumber: f.roundNumber,
                        createdAt: f.createdAt,
                        addressedAt: f.addressedAt,
                    })),
                }}
            />
        </>
    );
}
