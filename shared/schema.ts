import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, integer, jsonb, uuid, pgEnum, uniqueIndex } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { subscriptionPlans, type SubscriptionPlan } from "./subscriptions";

const storyCategoryEnum = pgEnum("story_category", [
  "BEDTIME",
  "CLASSIC",
  "FAIRYTALE",
  "ADVENTURE",
  "EDUCATIONAL",
  "CUSTOM",
]);

const rightsStatusEnum = pgEnum("story_rights_status", [
  "PUBLIC_DOMAIN",
  "LICENSED",
  "ORIGINAL",
  "UNSPECIFIED",
]);

const ttsProviderEnum = pgEnum("tts_provider", [
  "CHATTERBOX",
  "ELEVENLABS",
  "PLAYHT",
  "AZURE",
  "COQUI",
  "MOCK",
  "F5",
  "RVC",
]);

const jobStatusEnum = pgEnum("story_job_status", [
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
]);

export const storyCategories = storyCategoryEnum.enumValues;
export type StoryCategory = (typeof storyCategories)[number];
export const rightsStatuses = rightsStatusEnum.enumValues;
export type RightsStatus = (typeof rightsStatuses)[number];
export const ttsProviders = ttsProviderEnum.enumValues;
export type TTSProvider = (typeof ttsProviders)[number];
export const storyJobStatuses = jobStatusEnum.enumValues;
export type StoryJobStatus = (typeof storyJobStatuses)[number];

const storyCategoryZEnum = z.enum(storyCategories as [StoryCategory, ...StoryCategory[]]);
const rightsStatusZEnum = z.enum(rightsStatuses as [RightsStatus, ...RightsStatus[]]);
const ttsProviderZEnum = z.enum(ttsProviders as [TTSProvider, ...TTSProvider[]]);
const storyJobStatusZEnum = z.enum(storyJobStatuses as [StoryJobStatus, ...StoryJobStatus[]]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  username: varchar("username", { length: 50 }).notNull().unique(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  password: text("password").notNull(),
  firstName: varchar("first_name", { length: 50 }),
  lastName: varchar("last_name", { length: 50 }),
  avatar: text("avatar"),
  role: varchar("role", { length: 20 }).default("user"),
  plan: varchar("plan", { length: 20 }).notNull().$type<SubscriptionPlan>().default("free"),
  planRenewalAt: timestamp("plan_renewal_at"),
  isActive: boolean("is_active").default(true),
  isEmailVerified: boolean("is_email_verified").default(false),
  emailVerifiedAt: timestamp("email_verified_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const emailVerificationTokens = pgTable("email_verification_tokens", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  token: text("token").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  token: text("token").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const families = pgTable("families", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  ownerId: uuid("owner_id").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const familyMembers = pgTable("family_members", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  familyId: uuid("family_id").references(() => families.id).notNull(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  role: varchar("role", { length: 20 }).default("member"),
  joinedAt: timestamp("joined_at").defaultNow(),
});

export const videos = pgTable("videos", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  thumbnail: text("thumbnail"),
  videoUrl: text("video_url"),
  duration: integer("duration"), // in seconds
  status: varchar("status", { length: 20 }).default("draft"), // draft, processing, completed, error
  type: varchar("type", { length: 20 }).default("user_project"), // admin_provided, user_project
  familyId: uuid("family_id").references(() => families.id),
  createdBy: uuid("created_by").references(() => users.id).notNull(),
  metadata: jsonb("metadata"), // Additional video metadata
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const voiceProfiles = pgTable("voice_profiles", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 100 }).notNull(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  familyId: uuid("family_id").references(() => families.id),
  displayName: varchar("display_name", { length: 100 }),
  provider: ttsProviderEnum("provider").default("F5").notNull(),
  providerRef: text("provider_ref"),
  audioSampleUrl: text("audio_sample_url"),
  modelId: text("model_id"), // External AI service model ID
  rvcModelPath: text("rvc_model_path"), // Path to trained RVC checkpoint
  trainingProgress: integer("training_progress").default(0),
  status: varchar("status", { length: 20 }).default("training"), // training, ready, error
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const voiceGenerations = pgTable("voice_generations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  voiceProfileId: uuid("voice_profile_id").references(() => voiceProfiles.id).notNull(),
  text: text("text").notNull(),
  audioUrl: text("audio_url"),
  status: varchar("status", { length: 20 }).default("processing"), // processing, completed, error
  requestedBy: uuid("requested_by").references(() => users.id).notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const collaborationSessions = pgTable("collaboration_sessions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  videoId: uuid("video_id").references(() => videos.id).notNull(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  sessionData: jsonb("session_data"),
  lastActivity: timestamp("last_activity").defaultNow(),
  isActive: boolean("is_active").default(true),
});

export const activityLogs = pgTable("activity_logs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id).notNull(),
  action: varchar("action", { length: 100 }).notNull(),
  resourceType: varchar("resource_type", { length: 50 }).notNull(),
  resourceId: uuid("resource_id"),
  details: jsonb("details"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const usageTracking = pgTable("usage_tracking", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  videosCreated: integer("videos_created").default(0).notNull(),
  storiesCreated: integer("stories_created").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (usageTracking) => ({
  userPeriodUnique: uniqueIndex("usage_tracking_user_period_unique").on(usageTracking.userId, usageTracking.periodStart),
}));

export const songTemplates = pgTable("song_templates", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  guideAudioUrl: text("guide_audio_url").notNull(), // S3 or local path
  lyrics: text("lyrics"),
  key: varchar("key", { length: 50 }), // e.g., "C Major"
  tempo: integer("tempo"), // BPM
  durationSec: integer("duration_sec"),
  tags: jsonb("tags").$type<string[]>().default(sql`'[]'::jsonb`), // JSON array
  createdAt: timestamp("created_at").defaultNow(),
});

export const adPreferences = pgTable("ad_preferences", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  placementId: varchar("placement_id", { length: 100 }).notNull(),
  optOut: boolean("opt_out").default(false),
  dailyCap: integer("daily_cap").default(5),
  dailyImpressions: integer("daily_impressions").default(0),
  lastImpressionAt: timestamp("last_impression_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const stories = pgTable("stories", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: varchar("slug", { length: 160 }),
  title: varchar("title", { length: 200 }).notNull(),
  author: varchar("author", { length: 120 }),
  category: storyCategoryEnum("category").default("BEDTIME"),
  ageMin: integer("age_min"),
  ageMax: integer("age_max"),
  tags: jsonb("tags").$type<string[]>().default(sql`'[]'::jsonb`),
  coverUrl: text("cover_url"),
  durationMin: integer("duration_min"),
  rights: rightsStatusEnum("rights").default("UNSPECIFIED"),
  attribution: text("attribution"),
  content: text("content").notNull(),
  summary: text("summary"),
  familyId: uuid("family_id").references(() => families.id),
  createdBy: uuid("created_by").references(() => users.id),
  status: varchar("status", { length: 20 }).default("generated"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (stories) => ({
  slugIdx: uniqueIndex("stories_slug_unique").on(stories.slug),
}));

export const storySections = pgTable("story_sections", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  storyId: uuid("story_id").references(() => stories.id, { onDelete: "cascade" }).notNull(),
  sectionIndex: integer("section_index").notNull(),
  title: varchar("title", { length: 200 }),
  text: text("text").notNull(),
  wordCount: integer("word_count"),
  sectionType: varchar("section_type", { length: 20 }).default("speech").notNull(), // "speech" | "singing"
  songTemplateId: uuid("song_template_id"), // References pre-made guide tracks
  songMetadata: jsonb("song_metadata"), // JSON: { key, tempo, duration }
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (storySections) => ({
  sectionUnique: uniqueIndex("story_sections_story_index_unique").on(storySections.storyId, storySections.sectionIndex),
}));

export const storyAudio = pgTable("story_audio", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  sectionId: uuid("section_id").references(() => storySections.id, { onDelete: "cascade" }).notNull(),
  voiceId: uuid("voice_id").references(() => voiceProfiles.id, { onDelete: "cascade" }).notNull(),
  status: jobStatusEnum("status").default("PENDING").notNull(),
  audioUrl: text("audio_url"),
  transcript: text("transcript"),
  durationSec: integer("duration_sec"),
  checksum: varchar("checksum", { length: 128 }),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  error: text("error"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (storyAudio) => ({
  audioUnique: uniqueIndex("story_audio_section_voice_unique").on(storyAudio.sectionId, storyAudio.voiceId),
}));

export const storyNarrations = pgTable("story_narrations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  storyId: uuid("story_id").references(() => stories.id, { onDelete: "cascade" }).notNull(),
  voiceProfileId: uuid("voice_profile_id").references(() => voiceProfiles.id),
  voiceGenerationId: uuid("voice_generation_id").references(() => voiceGenerations.id),
  chunkIndex: integer("chunk_index").default(0),
  text: text("text").notNull(),
  audioUrl: text("audio_url"),
  audioFileName: text("audio_file_name"),
  status: varchar("status", { length: 20 }).default("processing"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
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
  storyAudio: many(storyAudio),
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

export const adPreferencesRelations = relations(adPreferences, ({ one }) => ({
  user: one(users, {
    fields: [adPreferences.userId],
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
  storyAudio: many(storyAudio),
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
  plan: z.enum(["free", "premium", "family", "plus"]).optional(),
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

export const insertVoiceProfileSchema = createInsertSchema(voiceProfiles, {
  provider: ttsProviderZEnum.default("F5"),
}).omit({
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
  category: storyCategoryZEnum.default("BEDTIME"),
  rights: rightsStatusZEnum.default("UNSPECIFIED"),
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
  status: storyJobStatusZEnum.default("PENDING"),
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

export const insertSongTemplateSchema = createInsertSchema(songTemplates).omit({
  id: true,
  createdAt: true,
});

export const insertAdPreferenceSchema = createInsertSchema(adPreferences).omit({
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
export type SongTemplate = typeof songTemplates.$inferSelect;
export type InsertSongTemplate = z.infer<typeof insertSongTemplateSchema>;

export { subscriptionPlans, type SubscriptionPlan } from "./subscriptions";
