import { db } from "../db.js";
import { sql } from "drizzle-orm";

let templateTableEnsured = false;

const isSQLite = process.env.DATABASE_URL?.startsWith('file:');

export async function ensureTemplateVideosTable() {
  if (templateTableEnsured) {
    return;
  }
  
  if (isSQLite) {
    // SQLite-specific table creation
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS template_videos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        thumbnail_url TEXT,
        video_url TEXT NOT NULL,
        duration INTEGER,
        category TEXT DEFAULT 'general',
        tags TEXT DEFAULT '[]',
        difficulty TEXT DEFAULT 'easy',
        is_active INTEGER DEFAULT 1,
        metadata TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);

    const columns = await db.all(sql`PRAGMA table_info(template_videos)`);
    const hasMetadataColumn = Array.isArray(columns) && columns.some((col: any) => col.name === "metadata");

    if (!hasMetadataColumn) {
      await db.run(sql.raw(`ALTER TABLE template_videos ADD COLUMN metadata TEXT`));
      await db.run(sql`UPDATE template_videos SET metadata = '{}' WHERE metadata IS NULL`);
    }
  } else {
    // PostgreSQL-specific table creation
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS template_videos (
        id SERIAL PRIMARY KEY,
        title VARCHAR(200) NOT NULL,
        description TEXT,
        thumbnail_url TEXT,
        video_url TEXT NOT NULL,
        duration INTEGER,
        category VARCHAR(50) DEFAULT 'general',
        tags JSONB DEFAULT '[]'::jsonb,
        difficulty VARCHAR(20) DEFAULT 'easy',
        is_active BOOLEAN DEFAULT true,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT now(),
        updated_at TIMESTAMP DEFAULT now()
      )
    `);
  }

  templateTableEnsured = true;
}
