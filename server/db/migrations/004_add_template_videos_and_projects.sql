-- Create template_videos table
CREATE TABLE IF NOT EXISTS template_videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  thumbnail_url TEXT NOT NULL,
  video_url TEXT NOT NULL,
  duration INTEGER NOT NULL,
  category TEXT NOT NULL,
  tags TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Create video_projects table
CREATE TABLE IF NOT EXISTS video_projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  template_video_id INTEGER NOT NULL,
  voice_profile_id INTEGER,
  face_image_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  output_video_url TEXT,
  processing_progress INTEGER DEFAULT 0,
  processing_error TEXT,
  metadata TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (template_video_id) REFERENCES template_videos(id) ON DELETE CASCADE
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_template_videos_category ON template_videos(category);
CREATE INDEX IF NOT EXISTS idx_template_videos_is_active ON template_videos(is_active);
CREATE INDEX IF NOT EXISTS idx_video_projects_user_id ON video_projects(user_id);
CREATE INDEX IF NOT EXISTS idx_video_projects_status ON video_projects(status);
CREATE INDEX IF NOT EXISTS idx_video_projects_template_id ON video_projects(template_video_id);
