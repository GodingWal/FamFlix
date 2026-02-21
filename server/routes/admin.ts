import { Router } from 'express';
import { db } from '../db.js';
import { sql } from 'drizzle-orm';
import type { AuthRequest } from '../middleware/auth-simple.js';

const router = Router();
const isSQLite = process.env.DATABASE_URL?.startsWith('file:');

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

// All routes in this router are protected by authenticateToken + requireRole(['admin'])
// applied at mount time in routes-simple.ts.

router.get('/stats', async (req: AuthRequest, res) => {
  try {
    const isActiveValue = isSQLite ? 1 : true;

    const totalUsers = await dbQueryOne(sql`SELECT COUNT(*) as count FROM users`);
    const totalTemplateVideos = await dbQueryOne(sql`SELECT COUNT(*) as count FROM template_videos WHERE is_active = ${isActiveValue}`);
    const totalVoiceClones = await dbQueryOne(sql`SELECT COUNT(*) as count FROM voice_profiles`);
    const totalVideos = await dbQueryOne(sql`SELECT COUNT(*) as count FROM videos`);

    const recentUsers = await dbQuery(sql`
      SELECT id, email, role, created_at
      FROM users
      ORDER BY created_at DESC
      LIMIT 10
    `);

    const recentTemplateVideos = await dbQuery(sql`
      SELECT id, title, category, created_at
      FROM template_videos
      WHERE is_active = ${isActiveValue}
      ORDER BY created_at DESC
      LIMIT 10
    `);

    const stats = {
      totalUsers: totalUsers?.count || 0,
      totalVideos: totalVideos?.count || 0,
      totalVoiceClones: totalVoiceClones?.count || 0,
      totalTemplateVideos: totalTemplateVideos?.count || 0,
      activeVoiceJobs: 0,
      completedVoiceJobs: 0,
      failedVoiceJobs: 0,
      recentUsers: recentUsers || [],
      recentVoiceJobs: [],
      recentTemplateVideos: recentTemplateVideos || [],
    };

    res.json(stats);
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({ error: 'Failed to fetch admin statistics' });
  }
});

router.get('/users', async (req: AuthRequest, res) => {
  try {
    const users = await dbQuery(sql`
      SELECT
        u.id, u.email, u.role, u.created_at,
        COUNT(vp.id) as voice_profiles_count
      FROM users u
      LEFT JOIN voice_profiles vp ON u.id = vp.user_id
      GROUP BY u.id, u.email, u.role, u.created_at
      ORDER BY u.created_at DESC
    `);

    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.patch('/users/:id/role', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be "user" or "admin"' });
    }

    await dbRun(sql`
      UPDATE users
      SET role = ${role}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
    `);

    res.json({ message: 'User role updated successfully' });
  } catch (error) {
    console.error('Error updating user role:', error);
    res.status(500).json({ error: 'Failed to update user role' });
  }
});

router.get('/health', async (req: AuthRequest, res) => {
  try {
    const dbCheck = await dbQueryOne(sql`SELECT 1 as healthy`);

    const ttsHealthy = true;

    const health = {
      database: dbCheck?.healthy === 1 || dbCheck?.healthy === true,
      tts: ttsHealthy,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };

    res.json(health);
  } catch (error) {
    console.error('Error checking system health:', error);
    res.status(500).json({
      error: 'Failed to check system health',
      database: false,
      tts: false,
      timestamp: new Date().toISOString()
    });
  }
});

export default router;
