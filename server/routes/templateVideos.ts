import { Router } from 'express';
import { db, pool } from '../db.js';
import { sql } from 'drizzle-orm';
import multer from 'multer';
import fs from 'fs/promises';
import path from 'path';
import { authenticateToken, AuthRequest } from '../middleware/auth-simple.js';
import { storage } from '../storage';
import { adminVideoPipelineService } from '../services/adminVideoPipelineService';
import { ensureTemplateVideosTable } from '../utils/templateVideos';
import { transcriptionService } from '../services/transcriptionService';

const router = Router();
const isSQLite = process.env.DATABASE_URL?.startsWith('file:');

const uploadsRoot = path.join(process.cwd(), 'uploads');
const videosDir = path.join(uploadsRoot, 'videos');
const thumbnailsDir = path.join(uploadsRoot, 'thumbnails');

async function ensureUploadDirs() {
  await fs.mkdir(videosDir, { recursive: true });
  await fs.mkdir(thumbnailsDir, { recursive: true });
}

async function safeUnlinkByUrl(fileUrl?: string | null) {
  if (!fileUrl || !fileUrl.startsWith('/uploads/')) {
    return;
  }
  const filePath = path.join(process.cwd(), fileUrl.replace(/^\/+/, ''));
  try {
    await fs.unlink(filePath);
  } catch (error: any) {
    if (error?.code !== 'ENOENT') {
      console.warn('[templateVideos] Failed to remove file', filePath, error);
    }
  }
}

function parseMetadata(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? { ...parsed } : {};
    } catch {
      return {};
    }
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    return { ...(value as Record<string, unknown>) };
  }
  return {};
}

async function dbQuery(query: ReturnType<typeof sql>): Promise<any[]> {
  if (isSQLite) {
    return await db.all(query);
  } else {
    const result = await db.execute(query);
    return result.rows || [];
  }
}

async function dbQueryOne(query: ReturnType<typeof sql>): Promise<any | null> {
  if (isSQLite) {
    return await db.get(query);
  } else {
    const result = await db.execute(query);
    return result.rows?.[0] || null;
  }
}

async function dbRun(query: ReturnType<typeof sql>): Promise<any> {
  if (isSQLite) {
    return await db.run(query);
  } else {
    return await db.execute(query);
  }
}

const storageConfig = multer.diskStorage({
  destination: async function (req, file, cb) {
    if (file.fieldname === 'video') {
      await fs.mkdir(videosDir, { recursive: true });
      cb(null, videosDir);
    } else {
      await fs.mkdir(thumbnailsDir, { recursive: true });
      cb(null, thumbnailsDir);
    }
  },
  filename: function (req, file, cb) {
    const title = req.body.title || 'video';
    const safeBase = String(title).toLowerCase().replace(/[^a-z0-9-_]+/g, '-').slice(0, 60);
    const ext = path.extname(file.originalname) || '.mp4';
    cb(null, `${Date.now()}_${safeBase}${ext}`);
  }
});

const upload = multer({
  storage: storageConfig,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 },
});

const mapTemplateVideoRow = (row: any) => {
  if (!row) return null;

  let parsedTags: string[] = [];
  if (Array.isArray(row.tags)) {
    parsedTags = row.tags;
  } else if (typeof row.tags === 'string') {
    try {
      parsedTags = JSON.parse(row.tags);
    } catch {
      parsedTags = [];
    }
  }

  const metadata = parseMetadata(row.metadata);

  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    thumbnailUrl: row.thumbnail_url ?? '',
    videoUrl: row.video_url,
    duration: row.duration ?? 0,
    category: row.category ?? 'general',
    tags: parsedTags,
    difficulty: row.difficulty ?? 'easy',
    isActive: row.is_active === 1 || row.is_active === true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    metadata,
  };
};

router.get('/api/template-videos', async (req, res) => {
  try {
    await ensureTemplateVideosTable();
    const isActiveValue = isSQLite ? 1 : true;
    const videos = await dbQuery(sql`
      SELECT * FROM template_videos 
      WHERE is_active = ${isActiveValue}
      ORDER BY category, created_at DESC
    `);

    const videosWithCamelCase = videos.map(mapTemplateVideoRow);
    res.json(videosWithCamelCase);
  } catch (error) {
    console.error('Error fetching template videos:', error);
    res.status(500).json({ error: 'Failed to fetch template videos' });
  }
});

router.get('/api/template-videos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await ensureTemplateVideosTable();
    const isActiveValue = isSQLite ? 1 : true;
    const video = await dbQueryOne(sql`
      SELECT * FROM template_videos 
      WHERE id = ${id} AND is_active = ${isActiveValue}
    `);

    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    res.json(mapTemplateVideoRow(video));
  } catch (error) {
    console.error('Error fetching template video:', error);
    res.status(500).json({ error: 'Failed to fetch template video' });
  }
});

router.get('/api/template-videos/category/:category', async (req, res) => {
  try {
    const { category } = req.params;
    await ensureTemplateVideosTable();
    const isActiveValue = isSQLite ? 1 : true;
    const videos = await dbQuery(sql`
      SELECT * FROM template_videos 
      WHERE category = ${category} AND is_active = ${isActiveValue}
      ORDER BY created_at DESC
    `);

    const videosWithCamelCase = videos.map(mapTemplateVideoRow);
    res.json(videosWithCamelCase);
  } catch (error) {
    console.error('Error fetching videos by category:', error);
    res.status(500).json({ error: 'Failed to fetch videos' });
  }
});

router.post('/api/template-videos', authenticateToken, upload.fields([
  { name: 'video', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 },
]), async (req: AuthRequest, res) => {
  let destPath: string | null = null;
  let createdThumbnailPath: string | null = null;
  let templateId: number | null = null;
  let adminVideoId: string | null = null;
  try {
    if (req.user?.role !== 'admin') {
      if (req.files) {
        const files = req.files as { [fieldname: string]: Express.Multer.File[] };
        if (files.video?.[0]) await fs.unlink(files.video[0].path).catch(() => { });
        if (files.thumbnail?.[0]) await fs.unlink(files.thumbnail[0].path).catch(() => { });
      }
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }

    await ensureTemplateVideosTable();

    const videoFile = Array.isArray((req.files as any)?.video) ? (req.files as any).video[0] : undefined;
    const thumbnailFile = Array.isArray((req.files as any)?.thumbnail) ? (req.files as any).thumbnail[0] : undefined;

    if (!videoFile) {
      return res.status(400).json({ error: 'Video file is required (field name: video)' });
    }

    destPath = videoFile.path;
    const filename = videoFile.filename;
    const videoUrl = `/uploads/videos/${filename}`;

    const { title, description, category = 'general', tags = '[]', difficulty = 'easy', duration } = req.body as any;
    if (!title || String(title).trim().length === 0) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const tagsJson = typeof tags === 'string' ? tags : JSON.stringify(tags ?? []);
    const durationNum = duration ? Number(duration) : null;
    let thumbnailUrl: string | null = null;

    if (thumbnailFile) {
      createdThumbnailPath = thumbnailFile.path;
      thumbnailUrl = `/uploads/thumbnails/${thumbnailFile.filename}`;
    }

    const nowIso = new Date().toISOString();
    const isActiveValue = isSQLite ? 1 : true;
    
    if (isSQLite) {
      const result = await db.run(sql`
        INSERT INTO template_videos (
          title, description, thumbnail_url, video_url, duration, category, tags, difficulty, is_active, metadata, created_at, updated_at
        ) VALUES (
          ${title}, ${description ?? null}, ${thumbnailUrl}, ${videoUrl}, ${durationNum}, ${category}, ${tagsJson}, ${difficulty}, ${isActiveValue}, ${JSON.stringify({})}, ${nowIso}, ${nowIso}
        )
      `);
      const inserted = await db.get(sql`
        SELECT * FROM template_videos WHERE id = ${result.lastInsertRowid}
      `);
      templateId = inserted?.id;
    } else {
      const result = await db.execute(sql`
        INSERT INTO template_videos (
          title, description, thumbnail_url, video_url, duration, category, tags, difficulty, is_active, metadata, created_at, updated_at
        ) VALUES (
          ${title}, ${description ?? null}, ${thumbnailUrl}, ${videoUrl}, ${durationNum}, ${category}, ${tagsJson}::jsonb, ${difficulty}, ${isActiveValue}, ${JSON.stringify({})}::jsonb, ${nowIso}::timestamp, ${nowIso}::timestamp
        ) RETURNING id
      `);
      templateId = result.rows?.[0]?.id;
    }

    if (!templateId) {
      throw new Error('Failed to retrieve inserted template video');
    }

    const adminVideo = await storage.createAdminProvidedVideo({
      title,
      description: description ?? null,
      thumbnail: thumbnailUrl,
      videoUrl,
      duration: durationNum,
      status: 'processing',
      familyId: null,
      createdBy: req.user!.id,
      metadata: {
        source: 'template_video',
        templateId: templateId,
      },
    } as any);
    adminVideoId = adminVideo.id;

    const templateMetadata = {
      sourceVideoId: adminVideo.id,
      pipelineStatus: 'queued',
    };

    await dbRun(sql`
      UPDATE template_videos
      SET metadata = ${isSQLite ? JSON.stringify(templateMetadata) : sql`${JSON.stringify(templateMetadata)}::jsonb`}, updated_at = ${new Date().toISOString()}${isSQLite ? sql`` : sql`::timestamp`}
      WHERE id = ${templateId}
    `);

    try {
      await adminVideoPipelineService.enqueue(adminVideo.id, adminVideo.videoUrl);
    } catch (pipelineError) {
      console.error('Failed to enqueue admin pipeline for template video:', pipelineError);
      if (templateId) {
        await dbRun(sql`DELETE FROM template_videos WHERE id = ${templateId}`);
      }
      if (destPath) {
        await fs.unlink(destPath).catch(() => undefined);
      }
      if (createdThumbnailPath) {
        await fs.unlink(createdThumbnailPath).catch(() => undefined);
      }
      if (adminVideoId) {
        await storage.deleteVideo(adminVideoId).catch(() => undefined);
      }
      return res.status(500).json({ error: 'Template video saved, but preprocessing pipeline failed to start.' });
    }

    const updated = await dbQueryOne(sql`SELECT * FROM template_videos WHERE id = ${templateId}`);
    res.status(201).json(mapTemplateVideoRow(updated));
  } catch (error) {
    console.error('Upload template video error:', error);
    if (templateId) {
      await dbRun(sql`DELETE FROM template_videos WHERE id = ${templateId}`).catch(() => undefined);
    }
    if (destPath) {
      await fs.unlink(destPath).catch(() => undefined);
    }
    if (createdThumbnailPath) {
      await fs.unlink(createdThumbnailPath).catch(() => undefined);
    }
    if (adminVideoId) {
      await storage.deleteVideo(adminVideoId).catch(() => undefined);
    }
    res.status(500).json({ error: 'Failed to upload video' });
  }
});

router.patch('/api/template-videos/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }

    await ensureTemplateVideosTable();
    const { id } = req.params;
    const video = await dbQueryOne(sql`SELECT * FROM template_videos WHERE id = ${id}`);
    if (!video) {
      return res.status(404).json({ error: 'Template video not found' });
    }

    const { title, description, category, difficulty, duration, tags, isActive, transcript } = req.body ?? {};
    const assignments: any[] = [];

    if (title !== undefined) {
      assignments.push(sql`title = ${title}`);
    }
    if (description !== undefined) {
      assignments.push(sql`description = ${description}`);
    }
    if (category !== undefined) {
      assignments.push(sql`category = ${category}`);
    }
    if (difficulty !== undefined) {
      assignments.push(sql`difficulty = ${difficulty}`);
    }
    if (duration !== undefined) {
      const durationValueRaw = duration === null || duration === '' ? null : Number(duration);
      const durationValue = durationValueRaw === null || Number.isFinite(durationValueRaw) ? durationValueRaw : null;
      assignments.push(sql`duration = ${durationValue}`);
    }
    if (transcript !== undefined) {
      const existingMeta = parseMetadata(video.metadata);
      const updatedMeta = { ...existingMeta, transcript: transcript || null };
      if (isSQLite) {
        assignments.push(sql`metadata = ${JSON.stringify(updatedMeta)}`);
      } else {
        assignments.push(sql`metadata = ${JSON.stringify(updatedMeta)}::jsonb`);
      }
    }
    if (tags !== undefined) {
      let tagsValue: string;
      if (Array.isArray(tags)) {
        tagsValue = JSON.stringify(tags);
      } else if (typeof tags === 'string') {
        try {
          JSON.parse(tags);
          tagsValue = tags;
        } catch {
          const splitTags = tags.split(',').map((tag) => tag.trim()).filter(Boolean);
          tagsValue = JSON.stringify(splitTags);
        }
      } else {
        tagsValue = JSON.stringify([]);
      }
      if (isSQLite) {
        assignments.push(sql`tags = ${tagsValue}`);
      } else {
        assignments.push(sql`tags = ${tagsValue}::jsonb`);
      }
    }
    if (isActive !== undefined) {
      if (isSQLite) {
        const activeValue = typeof isActive === 'boolean' ? (isActive ? 1 : 0) : Number(isActive) ? 1 : 0;
        assignments.push(sql`is_active = ${activeValue}`);
      } else {
        const activeValue = typeof isActive === 'boolean' ? isActive : Boolean(isActive);
        assignments.push(sql`is_active = ${activeValue}`);
      }
    }

    if (!assignments.length) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    if (isSQLite) {
      assignments.push(sql`updated_at = ${new Date().toISOString()}`);
    } else {
      assignments.push(sql`updated_at = ${new Date().toISOString()}::timestamp`);
    }

    await dbRun(sql`
      UPDATE template_videos
      SET ${sql.join(assignments, sql`, `)}
      WHERE id = ${id}
    `);

    const updated = await dbQueryOne(sql`SELECT * FROM template_videos WHERE id = ${id}`);
    res.json(mapTemplateVideoRow(updated));
  } catch (error) {
    console.error('Update template video error:', error);
    res.status(500).json({ error: 'Failed to update template video' });
  }
});

router.get('/api/template-videos/:id/transcript', authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }

    await ensureTemplateVideosTable();
    const { id } = req.params;
    const template = await dbQueryOne(sql`SELECT * FROM template_videos WHERE id = ${id}`);
    if (!template) {
      return res.status(404).json({ error: 'Template video not found' });
    }

    const metadata = parseMetadata(template.metadata);
    const transcript = metadata.transcript || null;
    const segments = metadata.transcriptSegments || [];
    const transcribedAt = metadata.transcribedAt || null;
    const duration = metadata.transcriptDuration || null;

    if (!transcript) {
      return res.status(404).json({ 
        error: 'No transcript available', 
        message: 'Use the transcribe endpoint to generate a transcript' 
      });
    }

    const source = metadata.transcriptSource || (metadata.editedAt ? 'admin_edited' : 'gemini_ai');
    
    res.json({
      transcript,
      segments,
      transcribedAt,
      duration,
      source,
      editedAt: metadata.editedAt || null,
      editedBy: metadata.editedBy || null,
      pipelineStatus: metadata.pipelineStatus || null
    });
  } catch (error) {
    console.error('Get template transcript error:', error);
    res.status(500).json({ error: 'Failed to get transcript' });
  }
});

router.patch('/api/template-videos/:id/transcript', authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }

    await ensureTemplateVideosTable();
    const { id } = req.params;
    const { segments } = req.body;

    if (!segments || !Array.isArray(segments)) {
      return res.status(400).json({ error: 'segments array is required' });
    }

    if (segments.length === 0) {
      return res.status(400).json({ error: 'At least one segment is required' });
    }

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (typeof seg.start !== 'number' || typeof seg.end !== 'number' || typeof seg.text !== 'string') {
        return res.status(400).json({ error: `Invalid segment at index ${i}: must have start (number), end (number), and text (string)` });
      }
      if (!Number.isFinite(seg.start) || !Number.isFinite(seg.end)) {
        return res.status(400).json({ error: `Invalid timing at segment ${i}: start and end must be finite numbers` });
      }
      if (seg.start < 0 || seg.end <= seg.start) {
        return res.status(400).json({ error: `Invalid timing at segment ${i}: start must be >= 0 and end must be > start` });
      }
      if (seg.end - seg.start < 0.05) {
        return res.status(400).json({ error: `Segment ${i} duration too short: minimum 0.05 seconds required` });
      }
      if (i > 0 && seg.start < segments[i - 1].end) {
        return res.status(400).json({ error: `Overlapping segments at index ${i}: start (${seg.start}) is before previous segment's end (${segments[i - 1].end})` });
      }
      if (!seg.text.trim()) {
        return res.status(400).json({ error: `Segment ${i} has empty text` });
      }
    }

    const template = await dbQueryOne(sql`SELECT * FROM template_videos WHERE id = ${id}`);
    if (!template) {
      return res.status(404).json({ error: 'Template video not found' });
    }

    const cleanedSegments = segments.map((s: { start: number; end: number; text: string }) => ({
      start: s.start,
      end: s.end,
      text: s.text.trim()
    }));
    
    const fullText = cleanedSegments.map((s: { text: string }) => s.text).join(' ');
    const lastSegment = cleanedSegments[cleanedSegments.length - 1];
    const transcriptDuration = lastSegment.end;

    const existingMeta = parseMetadata(template.metadata);
    const updatedMeta = {
      ...existingMeta,
      transcript: fullText,
      transcriptSegments: cleanedSegments,
      transcriptDuration,
      transcriptSource: 'admin_edited',
      editedAt: new Date().toISOString(),
      editedBy: req.user?.email || req.user?.id || 'admin',
      pipelineStatus: 'needs_regeneration'
    };

    if (isSQLite) {
      await dbRun(sql`
        UPDATE template_videos
        SET metadata = ${JSON.stringify(updatedMeta)}, updated_at = ${new Date().toISOString()}
        WHERE id = ${id}
      `);
    } else {
      await dbRun(sql`
        UPDATE template_videos
        SET metadata = ${JSON.stringify(updatedMeta)}::jsonb, updated_at = ${new Date().toISOString()}::timestamp
        WHERE id = ${id}
      `);
    }

    console.log(`[templateVideos] Transcript edited for template ${id} by ${updatedMeta.editedBy}: ${cleanedSegments.length} segments`);

    res.json({
      transcript: fullText,
      segments: cleanedSegments,
      transcribedAt: existingMeta.transcribedAt || null,
      duration: transcriptDuration,
      source: 'admin_edited',
      editedAt: updatedMeta.editedAt,
      editedBy: updatedMeta.editedBy,
      pipelineStatus: 'needs_regeneration'
    });
  } catch (error) {
    console.error('Update transcript error:', error);
    res.status(500).json({ error: 'Failed to update transcript' });
  }
});

router.post('/api/template-videos/:id/transcribe', authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }

    await ensureTemplateVideosTable();
    const { id } = req.params;
    const template = await dbQueryOne(sql`SELECT * FROM template_videos WHERE id = ${id}`);
    if (!template) {
      return res.status(404).json({ error: 'Template video not found' });
    }

    if (!transcriptionService.isConfigured()) {
      return res.status(503).json({ error: 'Transcription service is not configured' });
    }

    const videoUrl = template.video_url;
    if (!videoUrl) {
      return res.status(400).json({ error: 'Template video has no video file' });
    }

    const videoPath = path.join(process.cwd(), videoUrl.replace(/^\/+/, ''));
    
    try {
      await fs.access(videoPath);
    } catch {
      return res.status(404).json({ error: 'Video file not found on disk' });
    }

    console.log(`[templateVideos] Starting transcription for template ${id}: ${videoPath}`);
    const result = await transcriptionService.transcribeVideo(videoPath);
    
    const existingMeta = parseMetadata(template.metadata);
    const updatedMeta = { 
      ...existingMeta, 
      transcript: result.fullText,
      transcriptSegments: result.segments,
      transcriptDuration: result.duration,
      transcribedAt: new Date().toISOString()
    };
    
    if (isSQLite) {
      await dbRun(sql`
        UPDATE template_videos
        SET metadata = ${JSON.stringify(updatedMeta)}, updated_at = ${new Date().toISOString()}
        WHERE id = ${id}
      `);
    } else {
      await dbRun(sql`
        UPDATE template_videos
        SET metadata = ${JSON.stringify(updatedMeta)}::jsonb, updated_at = ${new Date().toISOString()}::timestamp
        WHERE id = ${id}
      `);
    }

    console.log(`[templateVideos] Transcription complete for template ${id}: ${result.fullText.length} characters, ${result.segments.length} segments`);
    res.json({ 
      transcript: result.fullText,
      segments: result.segments,
      duration: result.duration,
      transcribedAt: updatedMeta.transcribedAt
    });
  } catch (error) {
    console.error('Transcribe template video error:', error);
    res.status(500).json({ error: 'Failed to transcribe video' });
  }
});

router.delete('/api/template-videos/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }

    await ensureTemplateVideosTable();
    const { id } = req.params;
    const template = await dbQueryOne(sql`SELECT * FROM template_videos WHERE id = ${id}`);
    if (!template) {
      return res.status(404).json({ error: 'Template video not found' });
    }

    await dbRun(sql`DELETE FROM template_videos WHERE id = ${id}`);

    await safeUnlinkByUrl(template.video_url);
    await safeUnlinkByUrl(template.thumbnail_url);

    const meta = parseMetadata(template.metadata);
    if (meta.sourceVideoId) {
      await storage.deleteVideo(meta.sourceVideoId as string).catch(() => undefined);
    }

    res.json({ message: 'Template video deleted' });
  } catch (error) {
    console.error('Delete template video error:', error);
    res.status(500).json({ error: 'Failed to delete template video' });
  }
});

export default router;
