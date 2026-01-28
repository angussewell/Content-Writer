"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { scripts, intros, contextItems } from "@/db/schema";
import { eq, notInArray, and, inArray } from "drizzle-orm";

export async function login(prevState: any, formData: FormData) {
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

export async function updateScript(id: string, data: { title: string; body: string; intros: any[]; contextItems?: any[]; status?: "draft" | "filmed" | "done" | "archived" }) {
    console.log(`[updateScript] Received request for ID: ${id}`);

    await db.update(scripts).set({
        title: data.title,
        body: data.body,
        ...(data.status ? { status: data.status } : {}),
        updatedAt: new Date()
    }).where(eq(scripts.id, id));

    // Handle Intros
    const inputIntroIds = data.intros.map((i) => i.id).filter((id) => id && id.length > 10 && !id.includes("-")); // simplified
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

export async function updateScriptStatus(id: string, status: "draft" | "filmed" | "done" | "archived") {
    await db.update(scripts).set({ status }).where(eq(scripts.id, id));
    revalidatePath("/");
    revalidatePath(`/${id}`);
}
