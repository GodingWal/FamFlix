import { Router, type RequestHandler } from "express";

import { config } from "../config";
import { storage } from "../storage";
import { authenticateToken, type AuthRequest } from "../middleware/auth";
import {
  storyCategories,
  rightsStatuses,
  type Story,
  type StorySection,
  type StoryAudio,
  type StoryCategory,
  type RightsStatus,
} from "../db/schema";
import { enqueueStorySynthesis, storyQueue, type StorySynthesisJobData } from "../queues/storyQueue";
import { hasTTSProvider, getTTSProvider } from "../tts";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { Readable } from "stream";
import { usageService } from "../services/usageService";
import { aiService } from "../services/aiService";

const router = Router();

interface SynthesisJob {
  id: string;
  storyId: string;
  voiceId: string;
  state: "waiting" | "active" | "completed" | "failed";
  progress: number;
  totalSections: number;
  completedSections: number;
  currentSection: number;
  totalWords: number;
  completedWords: number;
  estimatedSecondsRemaining: number | null;
  avgMsPerWord: number | null;
  startedAt: Date;
  finishedAt: Date | null;
  error: string | null;
}

const inMemoryJobs = new Map<string, SynthesisJob>();

function getOrCreateJob(jobId: string, storyId: string, voiceId: string, totalSections: number, totalWords: number): SynthesisJob {
  let job = inMemoryJobs.get(jobId);
  if (!job) {
    job = {
      id: jobId,
      storyId,
      voiceId,
      state: "waiting",
      progress: 0,
      totalSections,
      completedSections: 0,
      currentSection: 0,
      totalWords,
      completedWords: 0,
      estimatedSecondsRemaining: null,
      avgMsPerWord: null,
      startedAt: new Date(),
      finishedAt: null,
      error: null,
    };
    inMemoryJobs.set(jobId, job);
  }
  return job;
}

function updateJobProgress(jobId: string, completedSections: number, completedWords: number, currentSection: number, avgMsPerWord?: number) {
  const job = inMemoryJobs.get(jobId);
  if (!job) return;
  
  job.completedSections = completedSections;
  job.completedWords = completedWords;
  job.currentSection = currentSection;
  job.state = "active";
  job.progress = job.totalSections > 0 ? Math.round((completedSections / job.totalSections) * 100) : 0;
  
  if (avgMsPerWord) {
    job.avgMsPerWord = avgMsPerWord;
    const remainingWords = job.totalWords - completedWords;
    job.estimatedSecondsRemaining = Math.ceil((remainingWords * avgMsPerWord) / 1000);
  }
}

function completeJob(jobId: string, failed: boolean = false, error?: string) {
  const job = inMemoryJobs.get(jobId);
  if (!job) return;
  
  job.state = failed ? "failed" : "completed";
  job.progress = failed ? job.progress : 100;
  job.finishedAt = new Date();
  job.error = error || null;
  
  setTimeout(() => {
    inMemoryJobs.delete(jobId);
  }, 5 * 60 * 1000);
}

const STORY_MODE_NOT_ENABLED = { error: "Story Mode is not enabled" } as const;
const STORY_RIGHTS_FOR_PUBLIC: RightsStatus[] = ["PUBLIC_DOMAIN", "LICENSED", "ORIGINAL"];
const CATEGORY_SET = new Set(storyCategories.map((category) => category.toUpperCase()));
const RIGHTS_SET = new Set(rightsStatuses.map((status) => status.toUpperCase()));

const ensureStoryModeEnabled: RequestHandler = (_req, res, next) => {
  if (!config.FEATURE_STORY_MODE) {
    return res.status(404).json(STORY_MODE_NOT_ENABLED);
  }
  return next();
};

function normalizeCategoryParam(value?: string | null): StoryCategory | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toUpperCase();
  return CATEGORY_SET.has(normalized) ? (normalized as StoryCategory) : undefined;
}

function normalizeRights(value?: string | null): RightsStatus | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toUpperCase();
  return RIGHTS_SET.has(normalized) ? (normalized as RightsStatus) : undefined;
}

function parseTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }

  if (typeof value === "string" && value.trim() !== "") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item));
      }
    } catch {
      return value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  return [];
}

function parseMetadata(value: unknown): Record<string, unknown> | undefined {
  if (!value) {
    return undefined;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return typeof parsed === "object" && parsed !== null ? parsed : undefined;
    } catch {
      return undefined;
    }
  }

  if (typeof value === "object") {
    return value as Record<string, unknown>;
  }

  return undefined;
}

function toIso(value: unknown): string | null {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value as string | number);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

function serializeStory(story: Story, options?: { includeContent?: boolean }) {
  const category = normalizeCategory(story.category);
  const rights = normalizeRights(story.rights) ?? "UNSPECIFIED";

  return {
    id: story.id,
    slug: story.slug,
    title: story.title,
    author: story.author ?? null,
    category,
    rights,
    tags: parseTags(story.tags),
    coverUrl: story.coverUrl ?? null,
    summary: story.summary ?? null,
    ageRange: {
      min: story.ageMin ?? null,
      max: story.ageMax ?? null,
    },
    durationMin: story.durationMin ?? null,
    metadata: parseMetadata(story.metadata) ?? {},
    createdAt: toIso(story.createdAt),
    updatedAt: toIso(story.updatedAt),
    ...(options?.includeContent ? { content: story.content } : {}),
  };
}

function serializeSection(section: StorySection, options?: { includeText?: boolean }) {
  const wordCount = typeof section.wordCount === "number"
    ? section.wordCount
    : section.text.split(/\s+/).filter(Boolean).length;

  return {
    id: section.id,
    index: section.sectionIndex,
    title: section.title ?? null,
    wordCount,
    ...(options?.includeText ? { text: section.text } : {}),
  };
}

function serializeAudioEntry(entry?: StoryAudio) {
  if (!entry) {
    return {
      status: "PENDING",
      audioUrl: null,
      durationSec: null,
      checksum: null,
      transcript: null,
      error: null,
      metadata: {},
      startedAt: null,
      completedAt: null,
      updatedAt: null,
    };
  }

  return {
    status: entry.status,
    audioUrl: entry.audioUrl ?? null,
    durationSec: entry.durationSec ?? null,
    checksum: entry.checksum ?? null,
    transcript: entry.transcript ?? null,
    error: entry.error ?? null,
    metadata: parseMetadata(entry.metadata) ?? {},
    startedAt: toIso(entry.startedAt),
    completedAt: toIso(entry.completedAt),
    updatedAt: toIso(entry.updatedAt),
  };
}

function normalizeCategory(value?: string | null): StoryCategory {
  const normalized = normalizeCategoryParam(value ?? undefined);
  return normalized ?? "BEDTIME";
}

function storyAccessibleToPublic(story: Story): boolean {
  const rights = normalizeRights(story.rights) ?? "UNSPECIFIED";
  return STORY_RIGHTS_FOR_PUBLIC.includes(rights);
}

// Create a sample story with ElevenLabs v3 emotional audio tags
router.post("/api/stories/sample-emotional", authenticateToken, ensureStoryModeEnabled, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;
    
    // Generate sample emotional story with ElevenLabs v3 tags
    const content = aiService.generateSampleEmotionalStory();
    const title = "The Magical Firefly Garden";
    
    // Create the story in database
    const story = await storage.createStory({
      content,
      createdBy: userId,
      familyId: null,
      category: "BEDTIME" as any,
      rights: "ORIGINAL" as any,
      title,
      status: "generated",
      metadata: {
        generator: "sample",
        hasEmotionalTags: true,
        emotionalTags: ["excited", "whispers", "laughing", "sighs"],
        elevenlabsModel: "eleven_v3",
        createdAt: new Date().toISOString(),
      },
    });
    
    // Split content into sections for TTS synthesis
    const paragraphs = content.split(/\n\n+/).filter(p => p.trim());
    const sections = paragraphs.map((text, index) => ({
      storyId: story.id,
      sectionIndex: index,
      text: text.trim(),
      wordCount: text.split(/\s+/).filter(Boolean).length,
      sectionType: "speech" as const,
    }));
    
    await storage.replaceStorySections(story.id, sections as any);
    
    res.status(201).json({
      success: true,
      story: serializeStory(story, { includeContent: true }),
      message: "Sample emotional story created with ElevenLabs v3 audio tags. The story includes [excited], [whispers], [laughing], and [sighs] tags for expressive narration.",
      emotionalTags: ["excited", "whispers", "laughing", "sighs"],
    });
  } catch (error) {
    next(error);
  }
});

router.get("/api/stories", ensureStoryModeEnabled, async (req, res) => {
  const category = normalizeCategoryParam(typeof req.query.category === "string" ? req.query.category : undefined);
  const query = typeof req.query.q === "string" ? req.query.q : undefined;
  const ageMin = typeof req.query.ageMin === "string" ? Number.parseInt(req.query.ageMin, 10) : undefined;
  const ageMax = typeof req.query.ageMax === "string" ? Number.parseInt(req.query.ageMax, 10) : undefined;
  const limit = typeof req.query.limit === "string" ? Number.parseInt(req.query.limit, 10) : undefined;
  const offset = typeof req.query.offset === "string" ? Number.parseInt(req.query.offset, 10) : undefined;

  const { items, total } = await storage.searchStories({
    category,
    query,
    ageMin: Number.isNaN(ageMin ?? NaN) ? undefined : ageMin,
    ageMax: Number.isNaN(ageMax ?? NaN) ? undefined : ageMax,
    limit,
    offset,
    rights: STORY_RIGHTS_FOR_PUBLIC,
    requireSlug: true,
  });

  const stories = items
    .filter(storyAccessibleToPublic)
    .map((story) => serializeStory(story));

  res.json({
    total,
    stories,
  });
});

router.get("/api/stories/:slug", ensureStoryModeEnabled, async (req, res) => {
  const story = await storage.getStoryBySlug(req.params.slug);
  if (!story || !storyAccessibleToPublic(story)) {
    return res.status(404).json({ error: "Story not found" });
  }

  const sections = await storage.getStorySections(story.id);
  const payload = serializeStory(story, { includeContent: true });

  return res.json({
    ...payload,
    sections: sections.map((section) => serializeSection(section, { includeText: true })),
  });
});

router.post("/api/stories/:slug/read", authenticateToken, ensureStoryModeEnabled, async (req: AuthRequest, res) => {
  const { voiceId, force } = req.body ?? {};

  if (!voiceId || typeof voiceId !== "string") {
    return res.status(400).json({ error: "voiceId is required" });
  }

  const story = await storage.getStoryBySlug(req.params.slug);
  if (!story || !storyAccessibleToPublic(story)) {
    return res.status(404).json({ error: "Story not found" });
  }

  const voice = await storage.getVoiceProfile(voiceId);
  if (!voice || voice.userId !== req.user!.id) {
    return res.status(403).json({ error: "You do not have access to this voice profile" });
  }

  // Check existing audio for this story+voice combination
  const existingAudioPre = await storage.getStoryAudioForVoice(story.id, voiceId);
  const sections = await storage.getStorySections(story.id);
  
  // Only consider it "fully narrated" if ALL sections have completed audio
  const allSectionsComplete = sections.length > 0 && 
    sections.every(section => 
      existingAudioPre.some(a => a.sectionId === section.id && a.status === "COMPLETED" && a.audioUrl)
    );
  
  // Check story limit for new narrations or partial narrations
  if (!allSectionsComplete) {
    // Check if user has already been charged for this story (track in metadata)
    const hasBeenCounted = existingAudioPre.some(a => {
      const meta = typeof a.metadata === 'string' ? JSON.parse(a.metadata || '{}') : (a.metadata || {});
      return meta.usageCounted === true;
    });
    
    if (!hasBeenCounted) {
      const limitCheck = await usageService.checkStoryLimit(req.user!.id);
      if (!limitCheck.allowed) {
        return res.status(403).json({
          error: limitCheck.message,
          code: "LIMIT_EXCEEDED",
          upgradeRequired: true
        });
      }
      // Increment story count for new narration (will be marked after first section completes)
      await usageService.incrementStoryCount(req.user!.id);
    }
  }

  const providerKey = voice.provider ?? config.TTS_PROVIDER;
  if (!hasTTSProvider(providerKey)) {
    return res.status(400).json({ error: `TTS provider '${providerKey}' is not configured` });
  }

  if (sections.length === 0) {
    return res.status(400).json({ error: "Story has no sections to synthesize" });
  }

  const existingAudio = existingAudioPre;
  const audioMap = new Map(existingAudio.map((audio) => [audio.sectionId, audio]));
  const needsRegeneration = sections.filter((section) => {
    const entry = audioMap.get(section.id);
    return !entry || entry.status !== "COMPLETED" || !entry.audioUrl;
  });

  if (!force && needsRegeneration.length === 0) {
    return res.json({
      ready: true,
      jobId: null,
      sections: sections.map((section) => ({
        ...serializeSection(section, { includeText: true }),
        audio: serializeAudioEntry(audioMap.get(section.id)),
      })),
    });
  }

  const jobId = `${story.id}:${voiceId}`;

  // If storyQueue is available (Redis configured), handle force removal
  if (storyQueue && force) {
    const existingJob = await storyQueue.getJob(jobId);
    if (existingJob) {
      await existingJob.remove();
    }
  }

  for (const section of sections) {
    const entry = audioMap.get(section.id);
    if (!entry || force || entry.status !== "COMPLETED") {
      await storage.upsertStoryAudio(section.id, voiceId, {
        status: "PENDING",
        audioUrl: entry?.audioUrl,
        durationSec: entry?.durationSec,
        checksum: entry?.checksum,
        startedAt: undefined,
        completedAt: undefined,
        error: undefined,
        metadata: entry?.metadata ? parseMetadata(entry.metadata) : undefined,
      });
    }
  }

  // If storyQueue is not available (no Redis), run async with in-memory job tracking
  if (!storyQueue) {
    const sectionsToProcess = sections.filter((section) => {
      const current = audioMap.get(section.id);
      return force || !current || current.status !== "COMPLETED" || !current.audioUrl;
    });
    const totalWords = sectionsToProcess.reduce((sum, s) => sum + (s.wordCount || 0), 0);
    
    const job = getOrCreateJob(jobId, story.id, voiceId, sectionsToProcess.length, totalWords);
    
    const providerKey = voice.provider ?? config.TTS_PROVIDER;
    const voiceRef = voice.providerRef!;
    const voiceModelId = voice.modelId ?? undefined;

    (async () => {
      let completedSections = 0;
      let completedWords = 0;
      let totalMs = 0;
      let failedCount = 0;
      let lastError: string | null = null;
      
      for (let i = 0; i < sectionsToProcess.length; i++) {
        const section = sectionsToProcess[i];
        const sectionStart = Date.now();

        const provider = getTTSProvider(providerKey);

        await storage.upsertStoryAudio(section.id, voiceId, {
          status: "PROCESSING",
          startedAt: new Date(),
        });
        
        updateJobProgress(jobId, completedSections, completedWords, i + 1);

        try {
          const result = await provider.synthesize({
            text: section.text,
            voiceRef,
            modelId: voiceModelId,
            storyId: story.id,
            sectionId: section.id,
            metadata: {
              songTemplateId: section.songTemplateId,
            },
          } as any);

          await storage.upsertStoryAudio(section.id, voiceId, {
            status: "COMPLETED",
            audioUrl: result.url,
            durationSec: result.durationSec,
            checksum: result.checksum,
            completedAt: new Date(),
            metadata: { key: result.key },
          });
          
          completedSections++;
          completedWords += section.wordCount || 0;
          const sectionMs = Date.now() - sectionStart;
          totalMs += sectionMs;
          const avgMsPerWord = completedWords > 0 ? totalMs / completedWords : undefined;
          updateJobProgress(jobId, completedSections, completedWords, i + 1, avgMsPerWord);
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          await storage.upsertStoryAudio(section.id, voiceId, {
            status: "FAILED",
            error: errMsg,
            completedAt: new Date(),
          });
          completedSections++;
          failedCount++;
          lastError = errMsg;
          updateJobProgress(jobId, completedSections, completedWords, i + 1);
        }
      }
      
      if (failedCount > 0) {
        completeJob(jobId, true, `${failedCount} section(s) failed: ${lastError}`);
      } else {
        completeJob(jobId);
      }
    })().catch((err) => {
      console.error("[StorySynthesis] Background job failed:", err);
      completeJob(jobId, true, err instanceof Error ? err.message : String(err));
    });

    return res.json({
      ready: false,
      jobId,
      state: job.state,
      progress: job.progress,
      totalSections: job.totalSections,
      completedSections: job.completedSections,
      estimatedSecondsRemaining: job.estimatedSecondsRemaining,
      story: {
        id: story.id,
        slug: story.slug,
        title: story.title,
      },
      voice: {
        id: voice.id,
        displayName: voice.displayName ?? voice.name,
      },
    });
  }

  // Normal path: enqueue and return job payload (storyQueue is available at this point)
  try {
    await enqueueStorySynthesis({ storyId: story.id, voiceId, force: Boolean(force) });
  } catch (error: any) {
    if (!String(error?.message ?? "").includes("already exists")) {
      throw error;
    }
  }

  const job = await storyQueue!.getJob(jobId);
  const state = job ? await job.getState() : "queued";
  const progress = job?.progress ?? 0;

  return res.json({
    ready: false,
    jobId,
    state,
    progress,
    story: {
      id: story.id,
      slug: story.slug,
      title: story.title,
    },
    voice: {
      id: voice.id,
      displayName: voice.displayName ?? voice.name,
    },
  });
});

router.get("/api/stories/:slug/audio", authenticateToken, ensureStoryModeEnabled, async (req: AuthRequest, res) => {
  const voiceId = typeof req.query.voiceId === "string" ? req.query.voiceId : undefined;

  if (!voiceId) {
    return res.status(400).json({ error: "voiceId query parameter is required" });
  }

  const story = await storage.getStoryBySlug(req.params.slug);
  if (!story || !storyAccessibleToPublic(story)) {
    return res.status(404).json({ error: "Story not found" });
  }

  const voice = await storage.getVoiceProfile(voiceId);
  if (!voice || voice.userId !== req.user!.id) {
    return res.status(403).json({ error: "You do not have access to this voice profile" });
  }

  const sections = await storage.getStorySections(story.id);
  const audioEntries = await storage.getStoryAudioForVoice(story.id, voiceId);
  const audioMap = new Map(audioEntries.map((entry) => [entry.sectionId, entry]));

  return res.json({
    story: serializeStory(story),
    voice: {
      id: voice.id,
      displayName: voice.displayName ?? voice.name,
    },
    sections: sections.map((section) => ({
      ...serializeSection(section, { includeText: true }),
      audio: serializeAudioEntry(audioMap.get(section.id)),
    })),
  });
});

router.get("/api/jobs/:jobId", authenticateToken, ensureStoryModeEnabled, async (req: AuthRequest, res) => {
  const memJob = inMemoryJobs.get(req.params.jobId);
  if (memJob) {
    const voice = await storage.getVoiceProfile(memJob.voiceId);
    if (!voice || voice.userId !== req.user!.id) {
      return res.status(403).json({ error: "You do not have access to this job" });
    }
    
    return res.json({
      id: memJob.id,
      state: memJob.state,
      progress: memJob.progress,
      totalSections: memJob.totalSections,
      completedSections: memJob.completedSections,
      currentSection: memJob.currentSection,
      estimatedSecondsRemaining: memJob.estimatedSecondsRemaining,
      attempts: 0,
      data: {
        storyId: memJob.storyId,
        voiceId: memJob.voiceId,
      },
      result: memJob.state === "completed" ? { success: true } : null,
      failedReason: memJob.error,
      timestamp: {
        createdAt: memJob.startedAt.toISOString(),
        finishedAt: memJob.finishedAt?.toISOString() ?? null,
      },
    });
  }
  
  if (!storyQueue) {
    return res.status(404).json({ error: "Job not found" });
  }
  
  const job = await storyQueue.getJob(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }

  const data = job.data as StorySynthesisJobData | undefined;
  if (!data) {
    return res.status(404).json({ error: "Invalid job payload" });
  }

  const voice = await storage.getVoiceProfile(data.voiceId);
  if (!voice || voice.userId !== req.user!.id) {
    return res.status(403).json({ error: "You do not have access to this job" });
  }

  const state = await job.getState();

  return res.json({
    id: job.id,
    state,
    progress: job.progress ?? 0,
    attempts: job.attemptsMade,
    data,
    result: job.returnvalue ?? null,
    failedReason: job.failedReason ?? null,
    timestamp: {
      createdAt: job.timestamp ? new Date(job.timestamp).toISOString() : null,
      finishedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
    },
  });
});

export default router;

// --- Downloads ---
// Download a single section audio as attachment
router.get("/api/stories/:slug/download/section/:sectionId", authenticateToken, ensureStoryModeEnabled, async (req: AuthRequest, res) => {
  const voiceId = typeof req.query.voiceId === "string" ? req.query.voiceId : undefined;
  const sectionId = req.params.sectionId;

  if (!voiceId) {
    return res.status(400).json({ error: "voiceId query parameter is required" });
  }

  const story = await storage.getStoryBySlug(req.params.slug);
  if (!story || !storyAccessibleToPublic(story)) {
    return res.status(404).json({ error: "Story not found" });
  }

  const voice = await storage.getVoiceProfile(voiceId);
  if (!voice || voice.userId !== req.user!.id) {
    return res.status(403).json({ error: "You do not have access to this voice profile" });
  }

  const sections = await storage.getStorySections(story.id);
  const section = sections.find((s) => s.id === sectionId);
  if (!section) {
    return res.status(404).json({ error: "Section not found" });
  }

  const audioEntries = await storage.getStoryAudioForVoice(story.id, voiceId);
  const entry = audioEntries.find((a) => a.sectionId === sectionId);
  if (!entry || entry.status !== "COMPLETED" || !entry.audioUrl) {
    return res.status(404).json({ error: "Audio not available for this section" });
  }

  const filename = `${story.slug}-${(voice.displayName ?? voice.name).replace(/\s+/g, "_")}-section-${section.sectionIndex + 1}.wav`;
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  const url = entry.audioUrl;
  try {
    if (url.startsWith("/api/audio/")) {
      const localName = url.split("/api/audio/").pop()!;
      const filePath = path.join(process.cwd(), "temp", localName);
      res.setHeader("Content-Type", "audio/wav");
      if (fs.existsSync(filePath)) {
        return fs.createReadStream(filePath).pipe(res);
      }
    }
    // Fallback: fetch remote URL and proxy
    const r = await fetch(url);
    if (!r.ok || !r.body) {
      return res.status(502).json({ error: `Failed to fetch audio (${r.status})` });
    }
    if (r.headers.get("content-type")) {
      res.setHeader("Content-Type", r.headers.get("content-type")!);
    } else {
      res.setHeader("Content-Type", "audio/wav");
    }
    // Convert Web ReadableStream to Node.js Readable and pipe
    return (Readable as any).fromWeb(r.body as any).pipe(res);
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

// Download the full story as a single merged WAV. Requires ffmpeg in PATH.
router.get("/api/stories/:slug/download/full", authenticateToken, ensureStoryModeEnabled, async (req: AuthRequest, res) => {
  const voiceId = typeof req.query.voiceId === "string" ? req.query.voiceId : undefined;
  if (!voiceId) {
    return res.status(400).json({ error: "voiceId query parameter is required" });
  }

  const story = await storage.getStoryBySlug(req.params.slug);
  if (!story || !storyAccessibleToPublic(story)) {
    return res.status(404).json({ error: "Story not found" });
  }
  const voice = await storage.getVoiceProfile(voiceId);
  if (!voice || voice.userId !== req.user!.id) {
    return res.status(403).json({ error: "You do not have access to this voice profile" });
  }

  const sections = await storage.getStorySections(story.id);
  const audioEntries = await storage.getStoryAudioForVoice(story.id, voiceId);
  const audioMap = new Map(audioEntries.map((a) => [a.sectionId, a]));
  const ordered = sections
    .map((s) => ({ s, a: audioMap.get(s.id) }))
    .filter((x) => x.a && x.a.status === "COMPLETED" && x.a.audioUrl) as any[];

  if (ordered.length === 0) {
    return res.status(400).json({ error: "No generated audio to merge" });
  }

  // Check ffmpeg availability
  try {
    const check = spawn("ffmpeg", ["-version"]);
    let checked = false;
    check.on("spawn", () => { checked = true; check.kill(); });
    await new Promise((resolve) => setTimeout(resolve, 150));
    if (!checked) {
      return res.status(501).json({ error: "ffmpeg not available on PATH. Install ffmpeg or download sections individually." });
    }
  } catch {
    return res.status(501).json({ error: "ffmpeg not available on PATH. Install ffmpeg or download sections individually." });
  }

  const inputs: string[] = ordered.map(({ a }) => {
    const url: string = a.audioUrl!;
    if (url.startsWith("/api/audio/")) {
      const localName = url.split("/api/audio/").pop()!;
      return path.join(process.cwd(), "temp", localName);
    }
    return url;
  });

  const args: string[] = ["-hide_banner", "-loglevel", "error"];
  for (const p of inputs) {
    args.push("-i", p);
  }
  const n = inputs.length;
  const filter = Array.from({ length: n }, (_, i) => `[${i}:a]`).join("") + `concat=n=${n}:v=0:a=1[a]`;
  args.push("-filter_complex", filter, "-map", "[a]", "-f", "wav", "pipe:1");

  const filename = `${story.slug}-${(voice.displayName ?? voice.name).replace(/\s+/g, "_")}.wav`;
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Type", "audio/wav");

  const ff = spawn("ffmpeg", args);
  ff.stdout.pipe(res);
  let errBuf = "";
  ff.stderr.on("data", (d) => { errBuf += String(d || ""); });
  ff.on("error", (e) => {
    if (!res.headersSent) {
      res.status(500).json({ error: e.message });
    } else {
      try { res.end(); } catch (e) {
        console.error("Failed to end response stream:", e);
      }
    }
  });
  ff.on("close", (code) => {
    if (code !== 0) {
      if (!res.headersSent) {
        res.status(500).json({ error: `ffmpeg failed with code ${code}: ${errBuf}` });
      } else {
        try { res.end(); } catch (e) {
          console.error("Failed to end response stream:", e);
        }
      }
    }
  });
});
