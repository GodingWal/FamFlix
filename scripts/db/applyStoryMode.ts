#!/usr/bin/env tsx
import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import Database from 'better-sqlite3';

type TableColumn = { cid: number; name: string; type: string; notnull: number; dflt_value: any; pk: number };

function tableInfo(db: Database.Database, table: string): TableColumn[] {
  const stmt = db.prepare(`PRAGMA table_info(${table})`);
  return stmt.all() as TableColumn[];
}

function hasColumn(db: Database.Database, table: string, column: string): boolean {
  return tableInfo(db, table).some((c) => c.name === column);
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL must be set');
  }
  if (!dbUrl.startsWith('file:')) {
    console.error('[applyStoryMode] This helper only supports SQLite (file: URL). For Postgres use your normal migrations.');
    process.exit(1);
  }

  const dbPath = dbUrl.replace('file:', '');
  const absDbPath = path.isAbsolute(dbPath) ? dbPath : path.resolve(process.cwd(), dbPath);
  const db = new Database(absDbPath);

  // Ensure base stories table exists (matches shared/schema-sqlite.ts)
  const ensureStoriesTable = `
    CREATE TABLE IF NOT EXISTS stories (
      id TEXT PRIMARY KEY,
      slug TEXT,
      title TEXT NOT NULL,
      author TEXT,
      category TEXT DEFAULT 'BEDTIME',
      age_min INTEGER,
      age_max INTEGER,
      tags TEXT DEFAULT '[]',
      cover_url TEXT,
      duration_min INTEGER,
      rights TEXT DEFAULT 'UNSPECIFIED',
      attribution TEXT,
      content TEXT NOT NULL,
      summary TEXT,
      family_id TEXT,
      created_by TEXT,
      status TEXT DEFAULT 'generated',
      metadata TEXT,
      created_at INTEGER DEFAULT (strftime('%s','now')),
      updated_at INTEGER DEFAULT (strftime('%s','now'))
    );
  `;

  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('BEGIN;');
  try {
    db.exec(ensureStoriesTable);

    // voice_profiles column extensions
    if (!hasColumn(db, 'voice_profiles', 'display_name')) {
      db.exec(`ALTER TABLE voice_profiles ADD COLUMN display_name TEXT`);
    }
    if (!hasColumn(db, 'voice_profiles', 'provider')) {
      db.exec(`ALTER TABLE voice_profiles ADD COLUMN provider TEXT DEFAULT 'ELEVENLABS'`);
    }
    if (!hasColumn(db, 'voice_profiles', 'provider_ref')) {
      db.exec(`ALTER TABLE voice_profiles ADD COLUMN provider_ref TEXT`);
    }

    // stories column extensions (when stories table already existed)
    const storyCols = [
      ['slug', "TEXT"],
      ['author', "TEXT"],
      ['age_min', "INTEGER"],
      ['age_max', "INTEGER"],
      ['tags', "TEXT"],
      ['cover_url', "TEXT"],
      ['duration_min', "INTEGER"],
      ['rights', "TEXT"],
      ['attribution', "TEXT"],
      ['summary', "TEXT"],
      ['family_id', "TEXT"],
      ['created_by', "TEXT"],
      ['status', "TEXT"],
      ['metadata', "TEXT"],
    ] as const;
    for (const [col, type] of storyCols) {
      if (!hasColumn(db, 'stories', col)) {
        // default values for some columns to avoid NULL issues in updates
        const defaultClause = col === 'rights' ? " DEFAULT 'UNSPECIFIED'" : col === 'tags' ? " DEFAULT '[]'" : '';
        db.exec(`ALTER TABLE stories ADD COLUMN ${col} ${type}${defaultClause}`);
      }
    }

    // indexes
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS stories_slug_unique ON stories(slug)`);

    // sections table
    db.exec(`
      CREATE TABLE IF NOT EXISTS story_sections (
        id TEXT PRIMARY KEY,
        story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
        section_index INTEGER NOT NULL,
        title TEXT,
        text TEXT NOT NULL,
        word_count INTEGER,
        created_at INTEGER DEFAULT (strftime('%s','now')),
        updated_at INTEGER DEFAULT (strftime('%s','now'))
      );
      CREATE UNIQUE INDEX IF NOT EXISTS story_sections_story_index_unique ON story_sections(story_id, section_index);
    `);

    // audio table
    db.exec(`
      CREATE TABLE IF NOT EXISTS story_audio (
        id TEXT PRIMARY KEY,
        section_id TEXT NOT NULL REFERENCES story_sections(id) ON DELETE CASCADE,
        voice_id TEXT NOT NULL REFERENCES voice_profiles(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'PENDING',
        audio_url TEXT,
        transcript TEXT,
        duration_sec INTEGER,
        checksum TEXT,
        started_at INTEGER,
        completed_at INTEGER,
        error TEXT,
        metadata TEXT,
        created_at INTEGER DEFAULT (strftime('%s','now')),
        updated_at INTEGER DEFAULT (strftime('%s','now'))
      );
      CREATE UNIQUE INDEX IF NOT EXISTS story_audio_section_voice_unique ON story_audio(section_id, voice_id);
    `);

    // Backfills
    // Normalize category and rights, tags
    db.exec(`UPDATE stories SET category = 'BEDTIME' WHERE category IS NULL OR TRIM(category) = '' OR category = 'kids_story'`);
    db.exec(`UPDATE stories SET rights = COALESCE(NULLIF(rights, ''), 'UNSPECIFIED')`);
    db.exec(`UPDATE stories SET tags = COALESCE(NULLIF(tags, ''), '[]')`);

    // Generate slugs if missing
    db.exec(`UPDATE stories SET slug = lower(replace(trim(title), ' ', '-')) WHERE (slug IS NULL OR slug = '') AND title IS NOT NULL`);
    db.exec(`UPDATE stories SET slug = id WHERE slug IS NULL OR slug = ''`);
    db.exec('COMMIT;');
    console.log('✅ Story Mode schema applied successfully.');
  } catch (err) {
    db.exec('ROLLBACK;');
    console.error('❌ Failed to apply Story Mode schema:', err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    db.close();
  }
}

main().catch((e) => {
  console.error('Unexpected error:', e);
  process.exit(1);
});
