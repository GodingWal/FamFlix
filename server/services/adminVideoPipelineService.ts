import path from "path";
import fs from "fs/promises";
import { spawn } from "child_process";
import { nanoid } from "nanoid";

import { storage } from "../storage";
import { config } from "../config";
import { logger } from "../utils/logger-simple";
import { InsertVideo } from "../db/schema";
import { db } from "../db.js";
import { sql } from "drizzle-orm";

const isSQLite = process.env.DATABASE_URL?.startsWith('file:') ?? false;

async function dbQueryOne(query: ReturnType<typeof sql>): Promise<any | null> {
  if (isSQLite) {
    return await (db as any).get(query);
  } else {
    const result = await db.execute(query);
    return (result as any).rows?.[0] || null;
  }
}

async function dbRun(query: ReturnType<typeof sql>): Promise<any> {
  if (isSQLite) {
    return await (db as any).run(query);
  } else {
    return await db.execute(query);
  }
}

type PipelineStatus = "queued" | "processing" | "completed" | "error";

interface PipelineJob {
  id: string;
  videoId: string;
  inputPath: string;
  status: PipelineStatus | "pending";
  attempts: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

interface PipelineResultPayload {
  audio_path?: string;
  diarization?: unknown;
  transcription?: unknown;
  processing_id?: string;
  [key: string]: unknown;
}

export class AdminVideoPipelineService {
  private readonly uploadsRoot = path.resolve(process.cwd(), config.UPLOAD_DIR ?? "uploads");
  private readonly pipelineDataDir = path.join(this.uploadsRoot, "admin-pipeline");
  private readonly pipelineResultsDir = path.join(this.pipelineDataDir, "results");
  private readonly pipelineCwd = path.resolve(process.cwd(), "windsurf-project");
  private readonly jobs: Map<string, PipelineJob> = new Map();
  private readonly queue: PipelineJob[] = [];
  private activeJob: PipelineJob | null = null;
  private ensureDirsPromise: Promise<void> | null = null;

  async enqueue(videoId: string, videoUrl?: string | null) {
    if (!videoUrl) {
      throw Object.assign(new Error("Video does not have a stored videoUrl yet"), { statusCode: 400 });
    }

    await this.ensureDirectories();
    const inputPath = await this.resolveUploadsPath(videoUrl);
    const job: PipelineJob = {
      id: nanoid(),
      videoId,
      inputPath,
      status: "queued",
      attempts: 0,
      createdAt: new Date(),
    };

    this.jobs.set(job.id, job);
    this.queue.push(job);

    await this.updateVideoPipelineState(videoId, {
      status: "queued",
      jobId: job.id,
      lastUpdatedAt: job.createdAt.toISOString(),
    }, "processing");

    void this.processQueue();
    return job;
  }

  private async processQueue() {
    if (this.activeJob || this.queue.length === 0) {
      return;
    }

    const job = this.queue.shift()!;
    this.activeJob = job;

    try {
      await this.runJob(job);
    } finally {
      this.activeJob = null;
      if (this.queue.length > 0) {
        void this.processQueue();
      }
    }
  }

  private async runJob(job: PipelineJob) {
    job.status = "processing";
    job.startedAt = new Date();

    await this.updateVideoPipelineState(job.videoId, {
      status: "processing",
      startedAt: job.startedAt.toISOString(),
      lastUpdatedAt: job.startedAt.toISOString(),
    }, "processing");

    try {
      const pipelineAvailable = await this.checkPipelineAvailable();
      
      if (!pipelineAvailable) {
        job.status = "completed";
        job.completedAt = new Date();

        await this.updateVideoPipelineState(job.videoId, {
          status: "completed",
          completedAt: job.completedAt.toISOString(),
          note: "Video uploaded successfully. Transcription/diarization processing unavailable in this environment.",
          diarization: null,
          transcription: null,
        }, "completed");

        logger.info("[admin-pipeline] job completed (pipeline unavailable, skipping processing)", {
          jobId: job.id,
          videoId: job.videoId,
        });
        return;
      }

      const resultPath = path.join(this.pipelineResultsDir, `${job.id}.json`);
      await this.executePythonPipeline(job, resultPath);

      const parsed = await this.readResultPayload(resultPath);
      job.status = "completed";
      job.completedAt = new Date();

      await this.updateVideoPipelineState(job.videoId, {
        status: "completed",
        completedAt: job.completedAt.toISOString(),
        processingId: typeof parsed.processing_id === "string" ? parsed.processing_id : undefined,
        audioUrl: this.toUploadsUrl(parsed.audio_path),
        diarization: parsed.diarization ?? null,
        transcription: parsed.transcription ?? null,
        artifacts: {
          audio: this.toUploadsUrl(parsed.audio_path),
          resultJson: this.toUploadsUrl(resultPath),
        },
      }, "completed");

      logger.info("[admin-pipeline] finished job", {
        jobId: job.id,
        videoId: job.videoId,
        audioUrl: this.toUploadsUrl(parsed.audio_path),
      });
    } catch (error) {
      job.status = "error";
      job.error = error instanceof Error ? error.message : String(error);
      job.completedAt = new Date();

      await this.updateVideoPipelineState(job.videoId, {
        status: "error",
        error: job.error,
        completedAt: job.completedAt.toISOString(),
      }, "error");

      logger.error("[admin-pipeline] job failed", {
        jobId: job.id,
        videoId: job.videoId,
        error: job.error,
      });
    }
  }

  private async checkPipelineAvailable(): Promise<boolean> {
    try {
      const cliPath = path.join(this.pipelineCwd, "pipeline", "cli.py");
      await fs.access(cliPath);
      return true;
    } catch {
      return false;
    }
  }

  private async executePythonPipeline(job: PipelineJob, outputJsonPath: string) {
    const pythonBin = await this.resolvePythonBinary();
    const model = process.env.ADMIN_PIPELINE_WHISPER_MODEL || "medium";
    const language = process.env.ADMIN_PIPELINE_LANGUAGE;

    await fs.mkdir(path.dirname(outputJsonPath), { recursive: true });

    const args = [
      "-m",
      "pipeline.cli",
      "process",
      job.inputPath,
      "--output-json",
      outputJsonPath,
      "--model",
      model,
    ];

    if (language) {
      args.push("--language", language);
    }

    const env = {
      ...process.env,
      DATA_DIR: this.pipelineDataDir,
    };

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(pythonBin, args, {
        cwd: this.pipelineCwd,
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stderr = "";
      proc.stdout?.on("data", (chunk: Buffer) => {
        logger.debug(`[admin-pipeline:${job.id}] ${chunk.toString().trim()}`);
      });
      proc.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      proc.on("error", (err: Error) => {
        reject(err);
      });
      proc.on("close", (code: number | null) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(stderr.trim() || `Pipeline exited with code ${code}`));
        }
      });
    });
  }

  private async resolvePythonBinary(): Promise<string> {
    const candidates: string[] = [];

    const repoVenvs = [
      path.join(this.pipelineCwd, "venv", "bin", "python"),
      path.join(this.pipelineCwd, ".venv", "bin", "python"),
      path.join(this.pipelineCwd, ".venv311", "bin", "python"),
    ];
    candidates.push(...repoVenvs);

    if (process.env.ADMIN_PIPELINE_PYTHON_BIN) {
      candidates.push(process.env.ADMIN_PIPELINE_PYTHON_BIN);
    }
    if (process.env.PYTHON_BIN) {
      candidates.push(process.env.PYTHON_BIN);
    }

    candidates.push("python3");

    const seen = new Set<string>();
    for (const candidate of candidates) {
      const key = candidate.startsWith("/") ? path.resolve(candidate) : candidate;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      if (candidate === "python3") {
        return candidate;
      }

      try {
        await fs.access(candidate);
        if (candidate !== "python3") {
          logger.debug("[admin-pipeline] Using Python interpreter", { candidate });
        }
        return candidate;
      } catch {
        continue;
      }
    }

    return "python3";
  }

  private async readResultPayload(resultPath: string): Promise<PipelineResultPayload> {
    const raw = await fs.readFile(resultPath, "utf-8");
    try {
      return JSON.parse(raw) as PipelineResultPayload;
    } catch (error) {
      throw new Error(`Failed to parse pipeline output JSON (${resultPath}): ${(error as Error).message}`);
    }
  }

  private async resolveUploadsPath(fileUrl: string) {
    if (/^https?:\/\//i.test(fileUrl)) {
      throw new Error("Remote video URLs are not supported for the local pipeline");
    }

    const withoutOrigin = fileUrl.startsWith("/")
      ? fileUrl.slice(1)
      : fileUrl;

    const normalized = withoutOrigin.startsWith(`${config.UPLOAD_DIR}/`)
      ? withoutOrigin.slice((config.UPLOAD_DIR + "/").length)
      : withoutOrigin.startsWith("uploads/")
        ? withoutOrigin.slice("uploads/".length)
        : withoutOrigin;

    if (!normalized || normalized.startsWith("..") || normalized.includes("..")) {
      throw new Error(`Invalid uploads path: ${fileUrl}`);
    }

    const absolute = path.resolve(this.uploadsRoot, normalized);
    const relative = path.relative(this.uploadsRoot, absolute);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`Uploads path escapes root: ${fileUrl}`);
    }

    await fs.access(absolute);
    return absolute;
  }

  private toUploadsUrl(candidate?: string | null) {
    if (!candidate) {
      return null;
    }

    const absolute = path.resolve(candidate);
    const relative = path.relative(this.uploadsRoot, absolute);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      return null;
    }

    return `/uploads/${relative.split(path.sep).join("/")}`;
  }

  private parseMetadata(value: unknown): Record<string, unknown> {
    if (!value) return {};
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object" ? { ...parsed } : {};
      } catch {
        return {};
      }
    }
    if (typeof value === "object" && !Array.isArray(value)) {
      return { ...(value as Record<string, unknown>) };
    }
    return {};
  }

  private sanitizeMetadata(value: Record<string, unknown>) {
    return JSON.parse(JSON.stringify(value ?? {}));
  }

  private async updateVideoPipelineState(
    videoId: string,
    pipelinePatch: Record<string, unknown>,
    status?: PipelineStatus,
  ) {
    const video = await storage.getVideo(videoId);
    if (!video) {
      logger.warn("[admin-pipeline] attempted to update missing video", { videoId });
      return;
    }

    const metadata = this.parseMetadata(video.metadata);
    const pipelineValue = metadata["pipeline"];
    const existingPipeline =
      pipelineValue && typeof pipelineValue === "object"
        ? (pipelineValue as Record<string, unknown>)
        : {};

    const nextPipeline = {
      ...existingPipeline,
      ...pipelinePatch,
    };

    const nextMetadata = {
      ...metadata,
      pipeline: nextPipeline,
    };

    const updatePayload: Partial<InsertVideo> = {
      metadata: this.sanitizeMetadata(nextMetadata),
    };

    if (status) {
      updatePayload.status = status;
    }

    await storage.updateVideo(videoId, updatePayload);

    await this.syncTemplateVideoMetadata(metadata, videoId, nextPipeline, status);
  }

  private async syncTemplateVideoMetadata(
    sourceMetadata: Record<string, unknown>,
    sourceVideoId: string,
    pipeline: Record<string, unknown>,
    status?: PipelineStatus
  ) {
    if (sourceMetadata?.["source"] !== "template_video") {
      return;
    }

    const templateId = sourceMetadata?.["templateId"];
    if (typeof templateId !== "number") {
      return;
    }

    try {
      const templateRow = await dbQueryOne(sql`SELECT metadata FROM template_videos WHERE id = ${templateId}`);
      if (!templateRow) {
        return;
      }

      const templateMeta = this.parseMetadata(templateRow.metadata);
      const templatePipelineValue = templateMeta["pipeline"];
      const templatePipeline =
        templatePipelineValue && typeof templatePipelineValue === "object"
          ? (templatePipelineValue as Record<string, unknown>)
          : {};

      const nextTemplateMetadata = this.sanitizeMetadata({
        ...templateMeta,
        sourceVideoId,
        pipelineStatus: pipeline?.status ?? status ?? templateMeta.pipelineStatus ?? "processing",
        pipeline: {
          ...templatePipeline,
          ...pipeline,
        },
      });

      if (isSQLite) {
        await dbRun(sql`
          UPDATE template_videos
          SET metadata = ${JSON.stringify(nextTemplateMetadata)}, updated_at = ${new Date().toISOString()}
          WHERE id = ${templateId}
        `);
      } else {
        await dbRun(sql`
          UPDATE template_videos
          SET metadata = ${JSON.stringify(nextTemplateMetadata)}::jsonb, updated_at = ${new Date().toISOString()}::timestamp
          WHERE id = ${templateId}
        `);
      }
    } catch (error) {
      logger.warn("[admin-pipeline] failed to sync template video metadata", {
        templateId,
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  private ensureDirectories() {
    if (!this.ensureDirsPromise) {
      this.ensureDirsPromise = (async () => {
        await fs.mkdir(this.uploadsRoot, { recursive: true });
        await fs.mkdir(this.pipelineDataDir, { recursive: true });
        await fs.mkdir(this.pipelineResultsDir, { recursive: true });
      })();
    }
    return this.ensureDirsPromise;
  }
}

export const adminVideoPipelineService = new AdminVideoPipelineService();
