// Template videos schema for database
import { integer, text, sqliteTable } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";

export const templateVideos = sqliteTable("template_videos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  description: text("description").notNull(),
  thumbnailUrl: text("thumbnail_url").notNull(),
  videoUrl: text("video_url").notNull(),
  duration: integer("duration").notNull(), // in seconds
  category: text("category").notNull(), // birthday, holiday, anniversary, etc.
  tags: text("tags").notNull(), // JSON array of tags
  difficulty: text("difficulty").notNull(), // easy, medium, hard (for face replacement complexity)
  isActive: integer("is_active").notNull().default(1), // 1 = active, 0 = inactive
  metadata: text("metadata"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const insertTemplateVideoSchema = createInsertSchema(templateVideos);
export type TemplateVideo = typeof templateVideos.$inferSelect;
export type InsertTemplateVideo = typeof templateVideos.$inferInsert;
