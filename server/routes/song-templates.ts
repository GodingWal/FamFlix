import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { authenticateToken, AuthRequest } from '../middleware/auth-simple';
import { storage } from '../storage';
import { songTemplates } from '../db/schema';
import { eq } from 'drizzle-orm';
import { db } from '../db';

const router = Router();

// Configure multer for guide audio uploads
const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => {
            const uploadPath = path.join(process.cwd(), 'uploads', 'guide-audio');
            // Ensure directory exists (sync check/create for simplicity in callback, or pre-create)
            // Better to pre-create or use fs.mkdir in a wrapper. 
            // For now, assume 'uploads/guide-audio' exists or let's rely on a startup script to create it.
            cb(null, uploadPath);
        },
        filename: (req, file, cb) => {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            cb(null, uniqueSuffix + path.extname(file.originalname));
        }
    }),
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

// Ensure upload dir exists
(async () => {
    try {
        await fs.mkdir(path.join(process.cwd(), 'uploads', 'guide-audio'), { recursive: true });
    } catch (e) { }
})();

// Get all song templates
router.get('/api/song-templates', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const templates = await db.select().from(songTemplates);
        res.json(templates);
    } catch (error) {
        console.error('Get song templates error:', error);
        res.status(500).json({ error: 'Failed to get song templates' });
    }
});

// Create a song template
router.post('/api/song-templates', authenticateToken, upload.single('guideAudio'), async (req: AuthRequest, res) => {
    try {
        if (req.user?.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied' });
        }

        if (!req.file) {
            return res.status(400).json({ error: 'Guide audio file is required' });
        }

        const { title, description, lyrics, key, tempo, durationSec } = req.body;

        if (!title) {
            return res.status(400).json({ error: 'Title is required' });
        }

        // Construct URL for the uploaded file
        // Assuming we serve 'uploads' statically or have a route for it.
        // Let's assume we'll add a static serve for /uploads/guide-audio
        const guideAudioUrl = `/uploads/guide-audio/${req.file.filename}`;

        const [template] = await db.insert(songTemplates).values({
            title,
            description,
            lyrics,
            key,
            tempo: tempo ? parseInt(tempo) : undefined,
            durationSec: durationSec ? parseInt(durationSec) : undefined,
            guideAudioUrl,
        }).returning();

        res.status(201).json(template);
    } catch (error: any) {
        console.error('Create song template error:', error);
        res.status(500).json({ error: error.message || 'Failed to create song template' });
    }
});

// Delete a song template
router.delete('/api/song-templates/:id', authenticateToken, async (req: AuthRequest, res) => {
    try {
        if (req.user?.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied' });
        }

        const { id } = req.params;
        await db.delete(songTemplates).where(eq(songTemplates.id, id));
        res.json({ message: 'Song template deleted' });
    } catch (error) {
        console.error('Delete song template error:', error);
        res.status(500).json({ error: 'Failed to delete song template' });
    }
});

export default router;
