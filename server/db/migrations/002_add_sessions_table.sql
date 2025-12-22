-- Add sessions table for secure session management
CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash text NOT NULL,
  expires_at timestamp NOT NULL,
  created_at timestamp DEFAULT NOW(),
  last_used_at timestamp DEFAULT NOW(),
  ip_address inet,
  user_agent text,
  is_active boolean DEFAULT true
);

-- Indexes for sessions table
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(refresh_token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(is_active);

-- Add cleanup function for expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
  DELETE FROM sessions WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Add failed login attempts table for security
CREATE TABLE IF NOT EXISTS failed_login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address inet NOT NULL,
  email varchar(255),
  attempt_time timestamp DEFAULT NOW(),
  user_agent text
);

-- Index for failed login attempts
CREATE INDEX IF NOT EXISTS idx_failed_attempts_ip ON failed_login_attempts(ip_address);
CREATE INDEX IF NOT EXISTS idx_failed_attempts_email ON failed_login_attempts(email);
CREATE INDEX IF NOT EXISTS idx_failed_attempts_time ON failed_login_attempts(attempt_time DESC);

-- Add cleanup function for old failed attempts
CREATE OR REPLACE FUNCTION cleanup_old_failed_attempts()
RETURNS void AS $$
BEGIN
  DELETE FROM failed_login_attempts WHERE attempt_time < NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql;
