import { pgTable, uuid, text, timestamp, integer, json, jsonb, index } from "drizzle-orm/pg-core";

export const scripts = pgTable("scripts", {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    body: text("body").default(""),
    status: text("status", { enum: ["draft", "filmed", "done", "archived"] }).default("draft").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    editStatus: text("edit_status").notNull().default("idle"),
    editClaimedAt: timestamp("edit_claimed_at"),
    editClaimedBy: text("edit_claimed_by"),
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

export const suggestions = pgTable("suggestions", {
    id: uuid("id").defaultRandom().primaryKey(),
    introId: uuid("intro_id")
        .references(() => intros.id, { onDelete: "cascade" })
        .notNull(),
    type: text("type", { enum: ["hook", "intro"] }).notNull(),
    score: integer("score"),
    content: json("content"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const scriptImages = pgTable("script_images", {
    id: uuid("id").defaultRandom().primaryKey(),
    scriptId: uuid("script_id")
        .references(() => scripts.id, { onDelete: "cascade" })
        .notNull(),
    imageUrl: text("image_url").notNull(),
    prompt: text("prompt"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const scriptFeedback = pgTable("script_feedback", {
    id: uuid("id").defaultRandom().primaryKey(),
    scriptId: uuid("script_id")
        .references(() => scripts.id, { onDelete: "cascade" })
        .notNull(),
    content: text("content").notNull(),
    roundNumber: integer("round_number").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    addressedAt: timestamp("addressed_at"),
}, (t) => [
    index("script_feedback_script_id_round_idx").on(t.scriptId, t.roundNumber),
]);

export const scriptRevisions = pgTable("script_revisions", {
    id: uuid("id").defaultRandom().primaryKey(),
    scriptId: uuid("script_id")
        .references(() => scripts.id, { onDelete: "cascade" })
        .notNull(),
    bodySnapshot: text("body_snapshot").notNull(),
    introsSnapshot: jsonb("intros_snapshot").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});
