// Video projects schema - tracks user's personalized video projects
import { integer, text, sqliteTable } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";

export const videoProjects = sqliteTable("video_projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  templateVideoId: integer("template_video_id").notNull(),
  voiceProfileId: integer("voice_profile_id"), // Link to voice clone
  faceImageUrl: text("face_image_url"), // User's face photo for replacement
  status: text("status").notNull().default("pending"), // pending, processing, completed, failed
  outputVideoUrl: text("output_video_url"), // Final personalized video URL
  processingProgress: integer("processing_progress").default(0), // 0-100
  processingError: text("processing_error"),
  metadata: text("metadata"), // JSON for additional data
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  completedAt: integer("completed_at", { mode: "timestamp" }),
});

export const insertVideoProjectSchema = createInsertSchema(videoProjects);
export type VideoProject = typeof videoProjects.$inferSelect;
export type InsertVideoProject = typeof videoProjects.$inferInsert;
