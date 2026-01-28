"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { scripts, intros, contextItems } from "@/db/schema";
import { eq, notInArray, and } from "drizzle-orm";

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

export async function updateScript(id: string, data: { title: string; body: string; intros: any[]; contextItems?: any[] }) {
    await db.update(scripts).set({
        title: data.title,
        body: data.body,
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
    if (data.contextItems) {
        const allInputContextIds = data.contextItems.map(i => i.id);

        if (allInputContextIds.length > 0) {
            await db.delete(contextItems).where(
                and(
                    eq(contextItems.scriptId, id),
                    notInArray(contextItems.id, allInputContextIds)
                )
            );
        } else {
            await db.delete(contextItems).where(eq(contextItems.scriptId, id));
        }

        for (const item of data.contextItems) {
            await db
                .insert(contextItems)
                .values({
                    id: item.id,
                    scriptId: id,
                    content: item.content,
                })
                .onConflictDoUpdate({
                    target: contextItems.id,
                    set: {
                        content: item.content,
                    },
                });
        }
    }
}

export async function deleteScript(id: string) {
    await db.delete(scripts).where(eq(scripts.id, id));
    redirect("/");
}
