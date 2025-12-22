-- Story Mode foundational schema

-- Extend voice profiles with provider metadata
ALTER TABLE voice_profiles ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE voice_profiles ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'ELEVENLABS';
ALTER TABLE voice_profiles ADD COLUMN IF NOT EXISTS provider_ref TEXT;

UPDATE voice_profiles
SET display_name = COALESCE(display_name, name)
WHERE display_name IS NULL;

UPDATE voice_profiles
SET provider = COALESCE(provider, 'ELEVENLABS');

UPDATE voice_profiles
SET provider_ref = COALESCE(provider_ref, model_id)
WHERE (provider_ref IS NULL OR provider_ref = '') AND model_id IS NOT NULL;

-- Extend stories with content metadata
ALTER TABLE stories ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS author TEXT;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS age_min INTEGER;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS age_max INTEGER;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS tags TEXT DEFAULT '[]';
ALTER TABLE stories ADD COLUMN IF NOT EXISTS cover_url TEXT;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS duration_min INTEGER;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS rights TEXT DEFAULT 'UNSPECIFIED';
ALTER TABLE stories ADD COLUMN IF NOT EXISTS attribution TEXT;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS summary TEXT;

UPDATE stories
SET category = 'BEDTIME'
WHERE category IS NULL OR TRIM(category) = '' OR category = 'kids_story';

UPDATE stories
SET rights = COALESCE(NULLIF(rights, ''), 'UNSPECIFIED');

UPDATE stories
SET tags = COALESCE(NULLIF(tags, ''), '[]');

UPDATE stories
SET slug = lower(replace(trim(title), ' ', '-'))
WHERE (slug IS NULL OR slug = '') AND title IS NOT NULL;

UPDATE stories
SET slug = id
WHERE slug IS NULL OR slug = '';

CREATE UNIQUE INDEX IF NOT EXISTS stories_slug_unique ON stories(slug);

-- Sections allow chunked narration
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

CREATE UNIQUE INDEX IF NOT EXISTS story_sections_story_index_unique
  ON story_sections(story_id, section_index);

-- Per-voice audio caching
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

CREATE UNIQUE INDEX IF NOT EXISTS story_audio_section_voice_unique
  ON story_audio(section_id, voice_id);
