import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, real, uniqueIndex } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { subscriptionPlans, type SubscriptionPlan } from "./subscriptions";

const storyCategoryEnum = z.enum([
  "BEDTIME",
  "CLASSIC",
  "FAIRYTALE",
  "ADVENTURE",
  "EDUCATIONAL",
  "CUSTOM",
] as const);

const rightsStatusEnum = z.enum([
  "PUBLIC_DOMAIN",
  "LICENSED",
  "ORIGINAL",
  "UNSPECIFIED",
] as const);

const ttsProviderEnum = z.enum([
  "CHATTERBOX",
  "ELEVENLABS",
  "PLAYHT",
  "AZURE",
  "COQUI",
  "MOCK",
  "F5",
  "RVC",
] as const);

const jobStatusEnum = z.enum([
  "PENDING",
  "QUEUED",
  "PROCESSING",
  "COMPLETE",
  "ERROR",
] as const);

export const storyCategories = storyCategoryEnum.options;
export type StoryCategory = z.infer<typeof storyCategoryEnum>;
export const rightsStatuses = rightsStatusEnum.options;
export type RightsStatus = z.infer<typeof rightsStatusEnum>;
export const ttsProviders = ttsProviderEnum.options;
export type TTSProvider = z.infer<typeof ttsProviderEnum>;
export const storyJobStatuses = jobStatusEnum.options;
export type StoryJobStatus = z.infer<typeof jobStatusEnum>;

export const users = sqliteTable("users", {
  id: text("id").primaryKey().$defaultFn(() => Math.random().toString(36).substring(2) + Date.now().toString(36)),
  username: text("username", { length: 50 }).notNull().unique(),
  email: text("email", { length: 255 }).notNull().unique(),
  password: text("password").notNull(),
  firstName: text("first_name", { length: 50 }),
  lastName: text("last_name", { length: 50 }),
  avatar: text("avatar"),
  role: text("role", { length: 20 }).default("user"),
  plan: text("plan", { length: 20 }).notNull().$type<SubscriptionPlan>().default("free"),
  planRenewalAt: integer("plan_renewal_at", { mode: "timestamp" }),
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  isEmailVerified: integer("is_email_verified", { mode: "boolean" }).default(false),
  emailVerifiedAt: integer("email_verified_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const emailVerificationTokens = sqliteTable("email_verification_tokens", {
  id: text("id").primaryKey().$defaultFn(() => Math.random().toString(36).substring(2) + Date.now().toString(36)),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  token: text("token").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const passwordResetTokens = sqliteTable("password_reset_tokens", {
  id: text("id").primaryKey().$defaultFn(() => Math.random().toString(36).substring(2) + Date.now().toString(36)),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  token: text("token").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const families = sqliteTable("families", {
  id: text("id").primaryKey().$defaultFn(() => Math.random().toString(36).substring(2) + Date.now().toString(36)),
  name: text("name", { length: 100 }).notNull(),
  description: text("description"),
  ownerId: text("owner_id").references(() => users.id).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const familyMembers = sqliteTable("family_members", {
  id: text("id").primaryKey().$defaultFn(() => Math.random().toString(36).substring(2) + Date.now().toString(36)),
  familyId: text("family_id").references(() => families.id).notNull(),
  userId: text("user_id").references(() => users.id).notNull(),
  role: text("role", { length: 20 }).default("member"),
  joinedAt: integer("joined_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const videos = sqliteTable("videos", {
  id: text("id").primaryKey().$defaultFn(() => Math.random().toString(36).substring(2) + Date.now().toString(36)),
  title: text("title", { length: 200 }).notNull(),
  description: text("description"),
  thumbnail: text("thumbnail"),
  videoUrl: text("video_url"),
  duration: integer("duration"), // in seconds
  status: text("status", { length: 20 }).default("draft"), // draft, processing, completed, error
  type: text("type", { length: 20 }).default("user_project"), // admin_provided, user_project
  familyId: text("family_id").references(() => families.id),
  createdBy: text("created_by").references(() => users.id).notNull(),
  metadata: text("metadata", { mode: "json" }), // Additional video metadata
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const voiceProfiles = sqliteTable("voice_profiles", {
  id: text("id").primaryKey().$defaultFn(() => Math.random().toString(36).substring(2) + Date.now().toString(36)),
  name: text("name", { length: 100 }).notNull(),
  userId: text("user_id").references(() => users.id).notNull(),
  familyId: text("family_id").references(() => families.id),
  displayName: text("display_name", { length: 100 }),
  provider: text("provider", { length: 50 }).default("F5"),
  providerRef: text("provider_ref"),
  audioSampleUrl: text("audio_sample_url"),
  modelId: text("model_id"), // External AI service model ID
  rvcModelPath: text("rvc_model_path"), // Path to trained RVC checkpoint
  trainingProgress: integer("training_progress").default(0),
  status: text("status", { length: 20 }).default("training"), // training, ready, error
  metadata: text("metadata", { mode: "json" }),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const voiceGenerations = sqliteTable("voice_generations", {
  id: text("id").primaryKey().$defaultFn(() => Math.random().toString(36).substring(2) + Date.now().toString(36)),
  voiceProfileId: text("voice_profile_id").references(() => voiceProfiles.id).notNull(),
  text: text("text").notNull(),
  audioUrl: text("audio_url"),
  status: text("status", { length: 20 }).default("processing"), // processing, completed, error
  requestedBy: text("requested_by").references(() => users.id).notNull(),
  metadata: text("metadata", { mode: "json" }),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const collaborationSessions = sqliteTable("collaboration_sessions", {
  id: text("id").primaryKey().$defaultFn(() => Math.random().toString(36).substring(2) + Date.now().toString(36)),
  videoId: text("video_id").references(() => videos.id).notNull(),
  userId: text("user_id").references(() => users.id).notNull(),
  sessionData: text("session_data", { mode: "json" }),
  lastActivity: integer("last_activity", { mode: "timestamp" }).$defaultFn(() => new Date()),
  isActive: integer("is_active", { mode: "boolean" }).default(true),
});

export const activityLogs = sqliteTable("activity_logs", {
  id: text("id").primaryKey().$defaultFn(() => Math.random().toString(36).substring(2) + Date.now().toString(36)),
  userId: text("user_id").references(() => users.id).notNull(),
  action: text("action", { length: 100 }).notNull(),
  resourceType: text("resource_type", { length: 50 }).notNull(),
  resourceId: text("resource_id"),
  details: text("details", { mode: "json" }),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const stories = sqliteTable("stories", {
  id: text("id").primaryKey().$defaultFn(() => Math.random().toString(36).substring(2) + Date.now().toString(36)),
  slug: text("slug", { length: 160 }),
  title: text("title", { length: 200 }).notNull(),
  author: text("author", { length: 120 }),
  category: text("category", { length: 50 }).default("BEDTIME"),
  ageMin: integer("age_min"),
  ageMax: integer("age_max"),
  tags: text("tags", { mode: "json" }).$defaultFn(() => JSON.stringify([])),
  coverUrl: text("cover_url"),
  durationMin: integer("duration_min"),
  rights: text("rights", { length: 40 }).default("UNSPECIFIED"),
  attribution: text("attribution"),
  content: text("content").notNull(),
  summary: text("summary"),
  familyId: text("family_id").references(() => families.id),
  createdBy: text("created_by").references(() => users.id),
  status: text("status", { length: 20 }).default("generated"),
  metadata: text("metadata", { mode: "json" }),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
}, (stories) => ({
  slugIdx: uniqueIndex("stories_slug_unique").on(stories.slug),
}));

export const storySections = sqliteTable("story_sections", {
  id: text("id").primaryKey().$defaultFn(() => Math.random().toString(36).substring(2) + Date.now().toString(36)),
  storyId: text("story_id").references(() => stories.id, { onDelete: "cascade" }).notNull(),
  sectionIndex: integer("section_index").notNull(),
  title: text("title", { length: 200 }),
  text: text("text").notNull(),
  wordCount: integer("word_count"),
  sectionType: text("section_type").default("speech").notNull(), // "speech" | "singing"
  songTemplateId: text("song_template_id"), // References pre-made guide tracks
  songMetadata: text("song_metadata"), // JSON: { key, tempo, duration }
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
}, (storySections) => ({
  sectionUnique: uniqueIndex("story_sections_story_index_unique").on(storySections.storyId, storySections.sectionIndex),
}));

export const storyAudio = sqliteTable("story_audio", {
  id: text("id").primaryKey().$defaultFn(() => Math.random().toString(36).substring(2) + Date.now().toString(36)),
  sectionId: text("section_id").references(() => storySections.id, { onDelete: "cascade" }).notNull(),
  voiceId: text("voice_id").references(() => voiceProfiles.id, { onDelete: "cascade" }).notNull(),
  status: text("status", { length: 20 }).notNull().default("PENDING"),
  audioUrl: text("audio_url"),
  transcript: text("transcript"),
  durationSec: integer("duration_sec"),
  checksum: text("checksum", { length: 128 }),
  startedAt: integer("started_at", { mode: "timestamp" }),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  error: text("error"),
  metadata: text("metadata", { mode: "json" }),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
}, (storyAudio) => ({
  audioUnique: uniqueIndex("story_audio_section_voice_unique").on(storyAudio.sectionId, storyAudio.voiceId),
}));

export const storyNarrations = sqliteTable("story_narrations", {
  id: text("id").primaryKey().$defaultFn(() => Math.random().toString(36).substring(2) + Date.now().toString(36)),
  storyId: text("story_id").references(() => stories.id, { onDelete: "cascade" }).notNull(),
  voiceProfileId: text("voice_profile_id").references(() => voiceProfiles.id),
  voiceGenerationId: text("voice_generation_id").references(() => voiceGenerations.id),
  chunkIndex: integer("chunk_index").default(0),
  text: text("text").notNull(),
  audioUrl: text("audio_url"),
  audioFileName: text("audio_file_name"),
  status: text("status", { length: 20 }).default("processing"),
  metadata: text("metadata", { mode: "json" }),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const adPreferences = sqliteTable("ad_preferences", {
  id: text("id").primaryKey().$defaultFn(() => Math.random().toString(36).substring(2) + Date.now().toString(36)),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  placementId: text("placement_id", { length: 100 }).notNull(),
  optOut: integer("opt_out", { mode: "boolean" }).default(false),
  dailyCap: integer("daily_cap").default(5),
  dailyImpressions: integer("daily_impressions").default(0),
  lastImpressionAt: integer("last_impression_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Marketing leads (for contact/interest submissions)
export const songTemplates = sqliteTable("song_templates", {
  id: text("id").primaryKey().$defaultFn(() => Math.random().toString(36).substring(2) + Date.now().toString(36)),
  title: text("title").notNull(),
  description: text("description"),
  guideAudioUrl: text("guide_audio_url").notNull(), // S3 or local path
  lyrics: text("lyrics"),
  key: text("key"), // e.g., "C Major"
  tempo: integer("tempo"), // BPM
  durationSec: real("duration_sec"),
  tags: text("tags", { mode: "json" }), // JSON array
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const templateVideos = sqliteTable("template_videos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  description: text("description"),
  thumbnailUrl: text("thumbnail_url"),
  videoUrl: text("video_url"),
  duration: integer("duration"),
  category: text("category").default("general"),
  tags: text("tags", { mode: "json" }),
  difficulty: text("difficulty").default("easy"),
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  metadata: text("metadata", { mode: "json" }),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const videoProjects = sqliteTable("video_projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  templateVideoId: integer("template_video_id").references(() => templateVideos.id, { onDelete: "cascade" }).notNull(),
  voiceProfileId: text("voice_profile_id").references(() => voiceProfiles.id),
  faceImageUrl: text("face_image_url"),
  status: text("status").default("pending").notNull(),
  outputVideoUrl: text("output_video_url"),
  processingProgress: integer("processing_progress").default(0),
  processingError: text("processing_error"),
  metadata: text("metadata", { mode: "json" }),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  completedAt: text("completed_at"),
});

// Usage tracking for subscription limits
export const usageTracking = sqliteTable("usage_tracking", {
  id: text("id").primaryKey().$defaultFn(() => Math.random().toString(36).substring(2) + Date.now().toString(36)),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  periodStart: integer("period_start", { mode: "timestamp" }).notNull(),
  periodEnd: integer("period_end", { mode: "timestamp" }).notNull(),
  videosCreated: integer("videos_created").default(0).notNull(),
  storiesCreated: integer("stories_created").default(0).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
}, (usageTracking) => ({
  userPeriodUnique: uniqueIndex("usage_tracking_user_period_unique").on(usageTracking.userId, usageTracking.periodStart),
}));

// Marketing leads (for contact/interest submissions)
export const marketingLeads = sqliteTable("marketing_leads", {
  id: text("id").primaryKey().$defaultFn(() => Math.random().toString(36).substring(2) + Date.now().toString(36)),
  name: text("name", { length: 100 }).notNull(),
  email: text("email", { length: 255 }).notNull(),
  familySize: integer("family_size").default(0),
  message: text("message"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  ownedFamilies: many(families),
  familyMemberships: many(familyMembers),
  videos: many(videos),
  voiceProfiles: many(voiceProfiles),
  collaborationSessions: many(collaborationSessions),
  activityLogs: many(activityLogs),
  emailVerificationTokens: many(emailVerificationTokens),
  passwordResetTokens: many(passwordResetTokens),
  adPreferences: many(adPreferences),
  usageTracking: many(usageTracking),
}));

export const usageTrackingRelations = relations(usageTracking, ({ one }) => ({
  user: one(users, {
    fields: [usageTracking.userId],
    references: [users.id],
  }),
}));

export const emailVerificationTokensRelations = relations(emailVerificationTokens, ({ one }) => ({
  user: one(users, {
    fields: [emailVerificationTokens.userId],
    references: [users.id],
  }),
}));

export const passwordResetTokensRelations = relations(passwordResetTokens, ({ one }) => ({
  user: one(users, {
    fields: [passwordResetTokens.userId],
    references: [users.id],
  }),
}));

export const familiesRelations = relations(families, ({ one, many }) => ({
  owner: one(users, {
    fields: [families.ownerId],
    references: [users.id],
  }),
  members: many(familyMembers),
  videos: many(videos),
  voiceProfiles: many(voiceProfiles),
}));

export const familyMembersRelations = relations(familyMembers, ({ one }) => ({
  family: one(families, {
    fields: [familyMembers.familyId],
    references: [families.id],
  }),
  user: one(users, {
    fields: [familyMembers.userId],
    references: [users.id],
  }),
}));

export const videosRelations = relations(videos, ({ one, many }) => ({
  family: one(families, {
    fields: [videos.familyId],
    references: [families.id],
  }),
  creator: one(users, {
    fields: [videos.createdBy],
    references: [users.id],
  }),
  collaborationSessions: many(collaborationSessions),
}));

export const voiceProfilesRelations = relations(voiceProfiles, ({ one, many }) => ({
  user: one(users, {
    fields: [voiceProfiles.userId],
    references: [users.id],
  }),
  family: one(families, {
    fields: [voiceProfiles.familyId],
    references: [families.id],
  }),
  generations: many(voiceGenerations),
}));

export const voiceGenerationsRelations = relations(voiceGenerations, ({ one }) => ({
  voiceProfile: one(voiceProfiles, {
    fields: [voiceGenerations.voiceProfileId],
    references: [voiceProfiles.id],
  }),
  requestedBy: one(users, {
    fields: [voiceGenerations.requestedBy],
    references: [users.id],
  }),
}));

export const collaborationSessionsRelations = relations(collaborationSessions, ({ one }) => ({
  video: one(videos, {
    fields: [collaborationSessions.videoId],
    references: [videos.id],
  }),
  user: one(users, {
    fields: [collaborationSessions.userId],
    references: [users.id],
  }),
}));

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
  user: one(users, {
    fields: [activityLogs.userId],
    references: [users.id],
  }),
}));

export const storiesRelations = relations(stories, ({ one, many }) => ({
  family: one(families, {
    fields: [stories.familyId],
    references: [families.id],
  }),
  creator: one(users, {
    fields: [stories.createdBy],
    references: [users.id],
  }),
  sections: many(storySections),
  narrations: many(storyNarrations),
}));

export const storySectionsRelations = relations(storySections, ({ one, many }) => ({
  story: one(stories, {
    fields: [storySections.storyId],
    references: [stories.id],
  }),
  audios: many(storyAudio),
  songTemplate: one(songTemplates, {
    fields: [storySections.songTemplateId],
    references: [songTemplates.id],
  }),
}));

export const songTemplatesRelations = relations(songTemplates, ({ many }) => ({
  sections: many(storySections),
}));

export const storyAudioRelations = relations(storyAudio, ({ one }) => ({
  section: one(storySections, {
    fields: [storyAudio.sectionId],
    references: [storySections.id],
  }),
  voice: one(voiceProfiles, {
    fields: [storyAudio.voiceId],
    references: [voiceProfiles.id],
  }),
}));

export const storyNarrationsRelations = relations(storyNarrations, ({ one }) => ({
  story: one(stories, {
    fields: [storyNarrations.storyId],
    references: [stories.id],
  }),
  voiceProfile: one(voiceProfiles, {
    fields: [storyNarrations.voiceProfileId],
    references: [voiceProfiles.id],
  }),
  voiceGeneration: one(voiceGenerations, {
    fields: [storyNarrations.voiceGenerationId],
    references: [voiceGenerations.id],
  }),
}));

export const adPreferencesRelations = relations(adPreferences, ({ one }) => ({
  user: one(users, {
    fields: [adPreferences.userId],
    references: [users.id],
  }),
}));

export const templateVideosRelations = relations(templateVideos, ({ many }) => ({
  projects: many(videoProjects),
}));

export const videoProjectsRelations = relations(videoProjects, ({ one }) => ({
  user: one(users, {
    fields: [videoProjects.userId],
    references: [users.id],
  }),
  templateVideo: one(templateVideos, {
    fields: [videoProjects.templateVideoId],
    references: [templateVideos.id],
  }),
  voiceProfile: one(voiceProfiles, {
    fields: [videoProjects.voiceProfileId],
    references: [voiceProfiles.id],
  }),
}));

// Insert schemas
const planEnum = z.enum(subscriptionPlans);

export const insertUserSchema = createInsertSchema(users, {
  plan: planEnum.default("free"),
  planRenewalAt: z.date().nullable().optional(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  isEmailVerified: true,
  emailVerifiedAt: true,
}).extend({
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const insertFamilySchema = createInsertSchema(families).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertVideoSchema = createInsertSchema(videos).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertVoiceProfileSchema = createInsertSchema(voiceProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertVoiceGenerationSchema = createInsertSchema(voiceGenerations).omit({
  id: true,
  createdAt: true,
});

export const insertCollaborationSessionSchema = createInsertSchema(collaborationSessions).omit({
  id: true,
  lastActivity: true,
});

export const insertActivityLogSchema = createInsertSchema(activityLogs).omit({
  id: true,
  createdAt: true,
});

export const insertStorySchema = createInsertSchema(stories, {
  category: storyCategoryEnum.default("BEDTIME"),
  rights: rightsStatusEnum.default("UNSPECIFIED"),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertStorySectionSchema = createInsertSchema(storySections).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertStoryAudioSchema = createInsertSchema(storyAudio, {
  status: jobStatusEnum.default("PENDING"),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertStoryNarrationSchema = createInsertSchema(storyNarrations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertEmailVerificationTokenSchema = createInsertSchema(emailVerificationTokens).omit({
  id: true,
  createdAt: true,
});

export const insertPasswordResetTokenSchema = createInsertSchema(passwordResetTokens).omit({
  id: true,
  createdAt: true,
});

export const insertAdPreferenceSchema = createInsertSchema(adPreferences).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMarketingLeadSchema = createInsertSchema(marketingLeads).omit({
  id: true,
  createdAt: true,
});

export const insertSongTemplateSchema = createInsertSchema(songTemplates).omit({
  id: true,
  createdAt: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Family = typeof families.$inferSelect;
export type InsertFamily = z.infer<typeof insertFamilySchema>;
export type Video = typeof videos.$inferSelect;
export type InsertVideo = z.infer<typeof insertVideoSchema>;
export type VoiceProfile = typeof voiceProfiles.$inferSelect;
export type InsertVoiceProfile = z.infer<typeof insertVoiceProfileSchema>;
export type VoiceGeneration = typeof voiceGenerations.$inferSelect;
export type InsertVoiceGeneration = z.infer<typeof insertVoiceGenerationSchema>;
export type CollaborationSession = typeof collaborationSessions.$inferSelect;
export type InsertCollaborationSession = z.infer<typeof insertCollaborationSessionSchema>;
export type ActivityLog = typeof activityLogs.$inferSelect;
export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;
export type EmailVerificationToken = typeof emailVerificationTokens.$inferSelect;
export type InsertEmailVerificationToken = z.infer<typeof insertEmailVerificationTokenSchema>;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type InsertPasswordResetToken = z.infer<typeof insertPasswordResetTokenSchema>;
export type Story = typeof stories.$inferSelect;
export type InsertStory = z.infer<typeof insertStorySchema>;
export type StorySection = typeof storySections.$inferSelect;
export type InsertStorySection = z.infer<typeof insertStorySectionSchema>;
export type StoryAudio = typeof storyAudio.$inferSelect;
export type InsertStoryAudio = z.infer<typeof insertStoryAudioSchema>;
export type StoryNarration = typeof storyNarrations.$inferSelect;
export type InsertStoryNarration = z.infer<typeof insertStoryNarrationSchema>;
export type AdPreference = typeof adPreferences.$inferSelect;
export type InsertAdPreference = z.infer<typeof insertAdPreferenceSchema>;
export type MarketingLead = typeof marketingLeads.$inferSelect;
export type InsertMarketingLead = z.infer<typeof insertMarketingLeadSchema>;
export type SongTemplate = typeof songTemplates.$inferSelect;
export type InsertSongTemplate = z.infer<typeof insertSongTemplateSchema>;

export { subscriptionPlans, type SubscriptionPlan } from "./subscriptions";
