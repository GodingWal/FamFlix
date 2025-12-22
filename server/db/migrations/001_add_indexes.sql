-- Add performance indexes for frequently queried columns

-- Users table indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Families table indexes
CREATE INDEX IF NOT EXISTS idx_families_owner ON families(owner_id);
CREATE INDEX IF NOT EXISTS idx_families_created ON families(created_at DESC);

-- Family members table indexes
CREATE INDEX IF NOT EXISTS idx_family_members_family ON family_members(family_id);
CREATE INDEX IF NOT EXISTS idx_family_members_user ON family_members(user_id);
CREATE INDEX IF NOT EXISTS idx_family_members_role ON family_members(role);
CREATE INDEX IF NOT EXISTS idx_family_members_joined ON family_members(joined_at DESC);

-- Videos table indexes
CREATE INDEX IF NOT EXISTS idx_videos_family ON videos(family_id);
CREATE INDEX IF NOT EXISTS idx_videos_creator ON videos(created_by);
CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status);
CREATE INDEX IF NOT EXISTS idx_videos_type ON videos(type);
CREATE INDEX IF NOT EXISTS idx_videos_created ON videos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_videos_family_status ON videos(family_id, status);

-- Voice profiles table indexes
CREATE INDEX IF NOT EXISTS idx_voice_profiles_user ON voice_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_voice_profiles_family ON voice_profiles(family_id);
CREATE INDEX IF NOT EXISTS idx_voice_profiles_status ON voice_profiles(status);
CREATE INDEX IF NOT EXISTS idx_voice_profiles_created ON voice_profiles(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_voice_profiles_family_user ON voice_profiles(family_id, user_id);

-- Voice generations table indexes
CREATE INDEX IF NOT EXISTS idx_voice_generations_profile ON voice_generations(voice_profile_id);
CREATE INDEX IF NOT EXISTS idx_voice_generations_requester ON voice_generations(requested_by);
CREATE INDEX IF NOT EXISTS idx_voice_generations_status ON voice_generations(status);
CREATE INDEX IF NOT EXISTS idx_voice_generations_created ON voice_generations(created_at DESC);

-- Collaboration sessions table indexes
CREATE INDEX IF NOT EXISTS idx_collaboration_video ON collaboration_sessions(video_id);
CREATE INDEX IF NOT EXISTS idx_collaboration_user ON collaboration_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_collaboration_active ON collaboration_sessions(is_active);
CREATE INDEX IF NOT EXISTS idx_collaboration_activity ON collaboration_sessions(last_activity DESC);

-- Activity logs table indexes
CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs(action);
CREATE INDEX IF NOT EXISTS idx_activity_logs_resource ON activity_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_created ON activity_logs(user_id, created_at DESC);

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_videos_family_created ON videos(family_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_voice_profiles_user_status ON voice_profiles(user_id, status);
CREATE INDEX IF NOT EXISTS idx_family_members_family_role ON family_members(family_id, role);
