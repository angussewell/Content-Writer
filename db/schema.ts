import { pgTable, uuid, text, timestamp, integer, json, jsonb, index, boolean, bigint, date, numeric } from "drizzle-orm/pg-core";

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

// Per decision #118: the script body is a list of lines, not one flat textarea.
// One row per line; `position` is numeric so a line can be inserted between two
// others without renumbering. Replaces scripts.body as the source of truth.
export const scriptLines = pgTable("script_lines", {
    id: uuid("id").defaultRandom().primaryKey(),
    scriptId: uuid("script_id")
        .references(() => scripts.id, { onDelete: "cascade" })
        .notNull(),
    position: numeric("position").notNull(),
    say: text("say"),
    onScreen: text("on_screen"),
    rationale: text("rationale"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Threaded per-line feedback. `author` is 'human' | 'ai'; an unaddressed 'ai'
// note is a cut/rewrite recommendation surfaced prominently in the editor.
export const lineNotes = pgTable("line_notes", {
    id: uuid("id").defaultRandom().primaryKey(),
    lineId: uuid("line_id")
        .references(() => scriptLines.id, { onDelete: "cascade" })
        .notNull(),
    scriptId: uuid("script_id")
        .references(() => scripts.id, { onDelete: "cascade" })
        .notNull(),
    author: text("author").notNull(),
    content: text("content").notNull(),
    addressedAt: timestamp("addressed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
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

export const videoIdeas = pgTable("video_ideas", {
    id: uuid("id").defaultRandom().primaryKey(),
    transcript: text("transcript").notNull(),
    recorded: boolean("recorded").default(false).notNull(),
    telegramMessageId: bigint("telegram_message_id", { mode: "bigint" }),
    sourceChatId: bigint("source_chat_id", { mode: "bigint" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    ideationStatus: text("ideation_status").default("pending"),
    ideationClaimedAt: timestamp("ideation_claimed_at", { withTimezone: true }),
    ideationClaimedBy: text("ideation_claimed_by"),
    scriptId: uuid("script_id").references(() => scripts.id),
}, (t) => [
    index("idx_video_ideas_created_at").on(t.createdAt.desc()),
    index("idx_video_ideas_recorded").on(t.recorded),
]);

export const youtubeIdeas = pgTable("youtube_ideas", {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status").default("idea").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    format: text("format"),
    hypothesis: text("hypothesis"),
    result: text("result"),
    verdict: text("verdict"),
    lesson: text("lesson"),
    filmedAt: date("filmed_at"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
});

export const buzzStories = pgTable("buzz_stories", {
    id: bigint("id", { mode: "number" }).primaryKey(),
    storyDate: date("story_date"),
    summary: text("summary"),
    reactAngle: text("react_angle"),
    interestScore: integer("interest_score"),
    memberPostIds: text("member_post_ids").array(),
    buzzCount: integer("buzz_count"),
    platforms: text("platforms").array(),
    topUrl: text("top_url"),
    surfaced: boolean("surfaced").default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const scriptRevisions = pgTable("script_revisions", {
    id: uuid("id").defaultRandom().primaryKey(),
    scriptId: uuid("script_id")
        .references(() => scripts.id, { onDelete: "cascade" })
        .notNull(),
    bodySnapshot: text("body_snapshot").notNull(),
    introsSnapshot: jsonb("intros_snapshot").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Posted-video analytics ───────────────────────────────────────────────
// One row per posted Instagram reel. Spine of the Metrics tab.
export const instagramMetrics = pgTable("instagram_metrics", {
    id: integer("id").primaryKey(),
    postId: integer("post_id"),
    instagramId: text("instagram_id").notNull(),
    avgWatchTime: integer("avg_watch_time"),
    reach: integer("reach"),
    likes: integer("likes"),
    comments: integer("comments"),
    shares: integer("shares"),
    saves: integer("saves"),
    mediaUrl: text("media_url"),
    caption: text("caption"),
    mediaType: text("media_type"),
    permalink: text("permalink"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    skipRate: text("skip_rate"),
    followsGenerated: integer("follows_generated"),
    analystNotes: text("analyst_notes"),
    isTrialReel: boolean("is_trial_reel").default(false),
    youtubeShortsUploaded: boolean("youtube_shorts_uploaded").default(false),
    tiktokUploaded: boolean("tiktok_uploaded").default(false),
    titleHook: text("title_hook"),
    retentionCurve: jsonb("retention_curve"),
});

// 1:1 with instagram_metrics. Read-only in the UI, hidden by default.
export const videoContentAnalysis = pgTable("video_content_analysis", {
    id: integer("id").primaryKey(),
    instagramMetricsId: integer("instagram_metrics_id").notNull(),
    transcript: text("transcript"),
    visualDescription: text("visual_description"),
    processingStatus: text("processing_status").default("pending"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// Locked q1–q15 descriptor set per reel. Read-only in the UI.
export const videoFeatures = pgTable("video_features", {
    id: bigint("id", { mode: "number" }).primaryKey(),
    instagramMetricsId: integer("instagram_metrics_id").notNull(),
    questionSetVersion: text("question_set_version").notNull(),
    descriptors: jsonb("descriptors").notNull(),
    extractorRunId: uuid("extractor_run_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    batchId: uuid("batch_id"),
    sourceTranscriptHash: text("source_transcript_hash"),
    analyzedAt: timestamp("analyzed_at", { withTimezone: true }).defaultNow().notNull(),
});

// One posted video → many rewrites. Consumed by the posted-video-rewrite skill.
export const videoRewrites = pgTable("video_rewrites", {
    id: integer("id").primaryKey(),
    instagramMetricsId: integer("instagram_metrics_id").notNull(),
    title: text("title"),
    rewriteRequest: text("rewrite_request").notNull(),
    status: text("status").default("pending").notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    claimedBy: text("claimed_by"),
    resultScriptId: uuid("result_script_id").references(() => scripts.id, { onDelete: "set null" }),
    notes: text("notes"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
    index("idx_video_rewrites_status").on(t.status),
    index("idx_video_rewrites_metrics_id").on(t.instagramMetricsId),
]);
