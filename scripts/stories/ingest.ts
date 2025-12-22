#!/usr/bin/env tsx
import "dotenv/config";

import path from "path";
import fs from "fs/promises";
import fg from "fast-glob";
import matter from "gray-matter";
import { z } from "zod";

import { pool, db } from "../../server/db";
import { storage } from "../../server/storage";
import { InsertStory, InsertStorySection, StoryCategory, RightsStatus, ttsProviders, users } from "../../server/db/schema";

const CONTENT_DIR = path.resolve(process.cwd(), "content/stories");
const DEFAULT_PROVIDER = ttsProviders.includes("ELEVENLABS") ? "ELEVENLABS" : ttsProviders[0];
const USING_SQLITE = (process.env.DATABASE_URL ?? "").startsWith("file:");

const frontMatterSchema = z.object({
  slug: z.string().optional(),
  title: z.string().min(1),
  author: z.string().optional(),
  category: z.string().optional(),
  ageMin: z.number().int().nonnegative().optional(),
  ageMax: z.number().int().nonnegative().optional(),
  tags: z.array(z.string()).optional(),
  coverUrl: z.string().url().optional(),
  durationMin: z.number().int().positive().optional(),
  rights: z.string().optional(),
  attribution: z.string().optional(),
  summary: z.string().optional(),
});

type FrontMatter = z.infer<typeof frontMatterSchema>;

function toSlug(source: string): string {
  return source
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeCategory(input?: string): StoryCategory {
  const fallback: StoryCategory = "BEDTIME";
  if (!input) return fallback;
  const normalized = input.trim().toUpperCase().replace(/\s+/g, "_");
  const allowed: StoryCategory[] = [
    "BEDTIME",
    "CLASSIC",
    "FAIRYTALE",
    "ADVENTURE",
    "EDUCATIONAL",
    "CUSTOM",
  ];
  const alias: Record<string, StoryCategory> = {
    KIDS: "BEDTIME",
    KIDS_STORY: "BEDTIME",
    STORY: "CUSTOM",
  };
  const value = alias[normalized] ?? (normalized as StoryCategory);
  return allowed.includes(value) ? value : fallback;
}

function normalizeRights(input?: string): RightsStatus {
  const fallback: RightsStatus = "UNSPECIFIED";
  if (!input) return fallback;
  const normalized = input.trim().toUpperCase().replace(/\s+/g, "_");
  const allowed: RightsStatus[] = [
    "PUBLIC_DOMAIN",
    "LICENSED",
    "ORIGINAL",
    "UNSPECIFIED",
  ];
  return allowed.includes(normalized as RightsStatus) ? (normalized as RightsStatus) : fallback;
}

function summarize(content: string): string {
  const clean = content.replace(/\s+/g, " ").trim();
  return clean.slice(0, 240) + (clean.length > 240 ? "…" : "");
}

function splitIntoSections(markdown: string): string[] {
  const paragraphs = markdown
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  const sections: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    const wordCount = candidate.split(/\s+/).length;
    if (wordCount <= 280) {
      current = candidate;
    } else {
      if (current) {
        sections.push(current);
      }
      current = paragraph;
    }
  }

  if (current) {
    sections.push(current);
  }

  return sections.length > 0 ? sections : [markdown];
}

async function ingestFile(filePath: string): Promise<void> {
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = matter(raw);
  const front = frontMatterSchema.parse(parsed.data ?? {});

  const slug = (front.slug && toSlug(front.slug)) || toSlug(path.basename(filePath, path.extname(filePath)));
  const title = front.title.trim();
  const category = normalizeCategory(front.category);
  const rights = normalizeRights(front.rights);
  const summary = front.summary ?? summarize(parsed.content);
  const tagsArray = front.tags ?? [];

  // Determine createdBy to satisfy potential NOT NULL/FK constraints
  let createdBy: string | undefined = process.env.STORIES_CREATED_BY_USER_ID;
  if (!createdBy) {
    try {
      const row = await db.select({ id: users.id }).from(users).limit(1);
      createdBy = row?.[0]?.id;
    } catch {
      // ignore; createdBy remains undefined if users table empty
    }
  }

  const insertStory: InsertStory = {
    slug,
    title,
    author: front.author,
    category,
    ageMin: front.ageMin,
    ageMax: front.ageMax,
    tags: USING_SQLITE ? JSON.stringify(tagsArray) : (tagsArray as any),
    coverUrl: front.coverUrl,
    durationMin: front.durationMin,
    rights,
    attribution: front.attribution,
    content: parsed.content.trim(),
    summary,
    createdBy,
    status: "ready",
    metadata: USING_SQLITE
      ? JSON.stringify({ sourceFile: path.relative(CONTENT_DIR, filePath), provider: DEFAULT_PROVIDER })
      : ({ sourceFile: path.relative(CONTENT_DIR, filePath), provider: DEFAULT_PROVIDER } as any),
  };

  const existing = await storage.getStoryBySlug(slug);
  const story = existing
    ? await storage.updateStory(existing.id, insertStory)
    : await storage.createStory(insertStory);

  const sectionsContent = splitIntoSections(parsed.content);
  const sectionInserts: InsertStorySection[] = sectionsContent.map((sectionText, index) => ({
    storyId: story.id,
    sectionIndex: index,
    text: sectionText,
    title: undefined,
    wordCount: sectionText.split(/\s+/).length,
  }));

  await storage.replaceStorySections(story.id, sectionInserts);

  console.log(`✅ Ingested story '${story.title}' with ${sectionInserts.length} section(s).`);
}

async function main() {
  const pattern = path.join(CONTENT_DIR, "**/*.mdx");
  const files = await fg(pattern, { absolute: true });

  if (files.length === 0) {
    console.warn(`No stories found in ${CONTENT_DIR}.`);
    return;
  }

  for (const file of files) {
    try {
      await ingestFile(file);
    } catch (error) {
      console.error(`❌ Failed to ingest ${file}:`, error instanceof Error ? error.message : error);
    }
  }
}

main()
  .catch((error) => {
    console.error("Story ingestion failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (pool) {
      await pool.end();
    }
  });
