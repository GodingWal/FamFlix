import { storage } from "../storage";
import { InsertVideo } from "../db/schema";
import { aiService } from "./aiService";
import { config } from "../config";
import { logger } from "../utils/logger-simple";
import path from "path";
import fs from "fs/promises";
import { nanoid } from "nanoid";
import type { Express } from "express";

interface ProcessedVideoUploadResult {
  videoUrl: string;
  localPath: string;
  thumbnail: string | null;
  duration: number | null;
  metadata: Record<string, unknown>;
}

export class VideoService {
  async createVideo(videoData: InsertVideo) {
    const video = await storage.createVideo(videoData);
    
    // Log activity
    await storage.logActivity({
      userId: video.createdBy,
      action: "create_video",
      resourceType: "video",
      resourceId: video.id,
      details: { title: video.title },
    });

    return video;
  }

  async updateVideo(videoId: string, updates: Partial<InsertVideo>, userId: string) {
    const video = await storage.updateVideo(videoId, updates);
    
    // Log activity
    await storage.logActivity({
      userId,
      action: "update_video",
      resourceType: "video", 
      resourceId: videoId,
      details: { updates },
    });

    return video;
  }

  async getVideosByFamily(familyId: string) {
    return await storage.getVideosByFamily(familyId);
  }

  async getVideosByUser(userId: string) {
    return await storage.getVideosByUser(userId);
  }

  async generateVideoScript(prompt: string, familyId?: string) {
    let familyContext = null;
    if (familyId) {
      // Get family context for better script generation
      const family = await storage.getFamily(familyId);
      const members = await storage.getFamilyMembers(familyId);
      familyContext = {
        familyName: family?.name,
        memberCount: members.length,
        memberNames: members.map(m => `${m.firstName} ${m.lastName}`).filter(Boolean),
      };
    }

    return await aiService.generateVideoScript(prompt, familyContext);
  }

  async generateVideoSuggestions(familyId: string) {
    const family = await storage.getFamily(familyId);
    const members = await storage.getFamilyMembers(familyId);
    const recentVideos = await storage.getVideosByFamily(familyId);

    const familyData = {
      familyName: family?.name,
      memberCount: members.length,
      recentVideoTitles: recentVideos.slice(0, 5).map(v => v.title),
    };

    return await aiService.generateVideoSuggestions(familyData);
  }

  async processVideoUpload(videoFile: Express.Multer.File): Promise<ProcessedVideoUploadResult> {
    if (!videoFile?.buffer?.length) {
      throw new Error("Video file buffer is empty");
    }

    const uploadsRoot = path.resolve(process.cwd(), config.UPLOAD_DIR ?? "uploads");
    const videosDir = path.join(uploadsRoot, "videos");
    await fs.mkdir(videosDir, { recursive: true });

    const originalExt = path.extname(videoFile.originalname || "") || ".mp4";
    const safeExt = originalExt.replace(/[^a-zA-Z0-9.]/g, "") || ".mp4";
    const fileName = `admin-${Date.now()}-${nanoid(8)}${safeExt}`;
    const filePath = path.join(videosDir, fileName);

    await fs.writeFile(filePath, videoFile.buffer);
    logger.info("Stored admin video upload", {
      destination: filePath,
      fileSize: videoFile.size,
    });

    const videoUrl = `/uploads/videos/${fileName}`;
    const metadata: Record<string, unknown> = {
      originalName: videoFile.originalname,
      mimeType: videoFile.mimetype,
      size: videoFile.size,
      uploadedAt: new Date().toISOString(),
    };

    return {
      videoUrl,
      localPath: filePath,
      thumbnail: null,
      duration: null,
      metadata,
    };
  }

  async deleteVideo(videoId: string, userId: string) {
    const video = await storage.getVideo(videoId);
    if (!video) {
      throw new Error("Video not found");
    }

    // End any active collaboration sessions
    const activeSessions = await storage.getActiveCollaborators(videoId);
    for (const session of activeSessions) {
      await storage.endCollaborationSession(session.id);
    }

    await storage.deleteVideo(videoId);

    // Log activity
    await storage.logActivity({
      userId,
      action: "delete_video",
      resourceType: "video",
      resourceId: videoId,
      details: { title: video.title },
    });
  }

  async enhanceVideoDescription(description: string) {
    return await aiService.enhanceVideoDescription(description);
  }

  async generateNarrationScript(videoContent: string, voicePersonality?: string) {
    return await aiService.generateNarrationScript(videoContent, voicePersonality);
  }
}

export const videoService = new VideoService();
