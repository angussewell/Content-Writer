import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

export const scripts = pgTable("scripts", {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    body: text("body").default(""),
    status: text("status", { enum: ["draft", "filmed", "done", "archived"] }).default("draft").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const intros = pgTable("intros", {
    id: uuid("id").defaultRandom().primaryKey(),
    scriptId: uuid("script_id")
        .references(() => scripts.id, { onDelete: "cascade" })
        .notNull(),
    titleHook: text("title_hook").default(""),
    verbalIntro: text("verbal_intro").default(""),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const contextItems = pgTable("context_items", {
    id: uuid("id").defaultRandom().primaryKey(),
    scriptId: uuid("script_id")
        .references(() => scripts.id, { onDelete: "cascade" })
        .notNull(),
    content: text("content").default("").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});
