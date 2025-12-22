import { Router } from 'express';
import multer from 'multer';
import { authenticateToken, AuthRequest } from '../middleware/auth-simple.js';
import { storage } from '../storage';
import { storyCategories, rightsStatuses } from '../db/schema';
import { aiService } from '../services/aiService';

const router = Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

const CATEGORY_SET = new Set(storyCategories.map((category) => category.toUpperCase()));
const RIGHTS_SET = new Set(rightsStatuses.map((status) => status.toUpperCase()));

function normalizeCategory(value?: string | null): string {
    if (!value) {
        return 'custom';
    }
    const normalized = value.trim().toUpperCase();
    return CATEGORY_SET.has(normalized) ? normalized : 'custom';
}

function parseTags(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.map((item) => String(item));
    }

    if (typeof value === 'string' && value.trim() !== '') {
        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) {
                return parsed.map((item) => String(item));
            }
        } catch {
            return value
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean);
        }
    }

    return [];
}

router.post('/api/stories-admin', authenticateToken, upload.single('story'), async (req: AuthRequest, res) => {
    try {
        if (req.user?.role !== 'admin') {
            return res.status(403).json({ error: 'You do not have permission to perform this action.' });
        }

        const storyFile = req.file;
        if (!storyFile) {
            return res.status(400).json({ error: 'Story file is required (field name: story)' });
        }

        const { title, author, summary, category, tags } = req.body as any;
        if (!title || String(title).trim().length === 0) {
            return res.status(400).json({ error: 'Title is required' });
        }

        const storyContent = storyFile.buffer.toString('utf-8');
        const sections = storyContent.split('\n\n').map((text, index) => ({
            text: text.trim(),
            index
        }));

        const slug = String(title).toLowerCase().replace(/[^a-z0-9-_]+/g, '-').slice(0, 60) || 'story';

        const story = await storage.createStory({
            title: String(title),
            slug,
            author: author ? String(author) : undefined,
            summary: summary ? String(summary) : undefined,
            category: normalizeCategory(category),
            rights: 'LICENSED',
            tags: parseTags(tags),
            content: storyContent,
        });

        const newSections = sections.map(section => ({
            storyId: story.id,
            sectionIndex: section.index,
            text: section.text,
            wordCount: section.text.split(/\s+/).filter(Boolean).length,
        }));
        await storage.replaceStorySections(story.id, newSections);

        res.status(201).json(story);
    } catch (error) {
        console.error('Upload story error:', error);
        res.status(500).json({ error: 'Failed to upload story' });
    }
});

// Update story sections (text, type, template)
router.put('/api/stories-admin/:id/sections', authenticateToken, async (req: AuthRequest, res) => {
    try {
        if (req.user?.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied' });
        }

        const { id } = req.params;
        const { sections } = req.body;

        if (!Array.isArray(sections)) {
            return res.status(400).json({ error: 'Sections array is required' });
        }

        // Verify story exists
        const story = await storage.getStory(id);
        if (!story) {
            return res.status(404).json({ error: 'Story not found' });
        }

        // Update sections
        // We'll use replaceStorySections for simplicity, but we need to map the incoming data
        // to the expected InsertStorySection format.
        // Note: replaceStorySections in storage.ts expects InsertStorySection[]
        // which includes storyId, sectionIndex, text, etc.

        const newSections = sections.map((s: any, index: number) => ({
            storyId: id,
            sectionIndex: index, // Ensure index is sequential
            text: s.text,
            wordCount: s.text.split(/\s+/).filter(Boolean).length,
            sectionType: s.sectionType || 'speech',
            songTemplateId: s.songTemplateId || null,
            songMetadata: s.songMetadata || null,
        }));

        await storage.replaceStorySections(id, newSections);

        res.json({ message: 'Sections updated successfully' });
    } catch (error) {
        console.error('Update sections error:', error);
        res.status(500).json({ error: 'Failed to update sections' });
    }
});

router.post('/api/story/generate', authenticateToken, async (req: AuthRequest, res) => {
    try {
        if (req.user?.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied' });
        }
        const { prompt, max_length, style } = req.body;
        if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

        const text = await aiService.generateWithGPUServerOrFallback(prompt, max_length || 500, style || 'narrative');
        res.json({ text });
    } catch (error) {
        console.error('Story generation error:', error);
        res.status(500).json({ error: 'Failed to generate story' });
    }
});

export default router;
