import { db } from "@/lib/db";
import { scripts, intros, contextItems } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
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

    return (
        <>
            <Toaster position="top-center" />
            <Editor
                initialData={{
                    id: script.id,
                    title: script.title,
                    body: script.body || "",
                    intros: scriptIntros.map((i): any => ({
                        id: i.id,
                        titleHook: i.titleHook || "",
                        verbalIntro: i.verbalIntro || "",
                    })),
                    contextItems: scriptContextItems.map((c): any => ({
                        id: c.id,
                        content: c.content || "",
                    })),
                }}
            />
        </>
    );
}
