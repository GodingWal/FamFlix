import * as sqliteSchema from '@shared/schema-sqlite';
import * as pgSchema from '@shared/schema';

const isSQLite = typeof process !== 'undefined' && process.env.DATABASE_URL?.startsWith('file:');

export const schema = isSQLite ? sqliteSchema : pgSchema;

// Re-export table constants so callers can import them directly
export const users = schema.users;
export const families = schema.families;
export const familyMembers = schema.familyMembers;
export const videos = schema.videos;
export const voiceProfiles = schema.voiceProfiles;
export const voiceGenerations = schema.voiceGenerations;
export const collaborationSessions = schema.collaborationSessions;
export const activityLogs = schema.activityLogs;
export const emailVerificationTokens = schema.emailVerificationTokens;
export const passwordResetTokens = schema.passwordResetTokens;
export const adPreferences = schema.adPreferences;
export const stories = schema.stories;
export const storySections = schema.storySections;
export const storyAudio = schema.storyAudio;
export const storyNarrations = schema.storyNarrations;
export const usageTracking = schema.usageTracking;

export const storyCategories = schema.storyCategories;
export const rightsStatuses = schema.rightsStatuses;
export const ttsProviders = schema.ttsProviders;
export const storyJobStatuses = schema.storyJobStatuses;

export type StoryCategory = typeof storyCategories[number];
export type RightsStatus = typeof rightsStatuses[number];
export type TTSProvider = typeof ttsProviders[number];
export type StoryJobStatus = typeof storyJobStatuses[number];

// Also re-export simple values where shape is DB-agnostic
export const subscriptionPlans = schema.subscriptionPlans;

// Type helpers inferred from dynamic tables
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Family = typeof families.$inferSelect;
export type InsertFamily = typeof families.$inferInsert;
export type Video = typeof videos.$inferSelect;
export type InsertVideo = typeof videos.$inferInsert;
export type VoiceProfile = typeof voiceProfiles.$inferSelect;
export type InsertVoiceProfile = typeof voiceProfiles.$inferInsert;
export type VoiceGeneration = typeof voiceGenerations.$inferSelect;
export type InsertVoiceGeneration = typeof voiceGenerations.$inferInsert;
export type CollaborationSession = typeof collaborationSessions.$inferSelect;
export type InsertCollaborationSession = typeof collaborationSessions.$inferInsert;
export type ActivityLog = typeof activityLogs.$inferSelect;
export type InsertActivityLog = typeof activityLogs.$inferInsert;
export type EmailVerificationToken = typeof emailVerificationTokens.$inferSelect;
export type InsertEmailVerificationToken = typeof emailVerificationTokens.$inferInsert;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type InsertPasswordResetToken = typeof passwordResetTokens.$inferInsert;
export type AdPreference = typeof adPreferences.$inferSelect;
export type InsertAdPreference = typeof adPreferences.$inferInsert;
export type Story = typeof stories.$inferSelect;
export type InsertStory = typeof stories.$inferInsert;
export type StorySection = typeof storySections.$inferSelect;
export type InsertStorySection = typeof storySections.$inferInsert;
export type StoryAudio = typeof storyAudio.$inferSelect;
export type InsertStoryAudio = typeof storyAudio.$inferInsert;
export type StoryNarration = typeof storyNarrations.$inferSelect;
export type InsertStoryNarration = typeof storyNarrations.$inferInsert;
export type UsageTracking = typeof usageTracking.$inferSelect;
export type InsertUsageTracking = typeof usageTracking.$inferInsert;
export type SongTemplate = typeof schema.songTemplates.$inferSelect;
export type InsertSongTemplate = typeof schema.songTemplates.$inferInsert;

export const songTemplates = schema.songTemplates;
