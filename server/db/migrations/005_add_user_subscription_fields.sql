-- Add subscription plan tracking to users
ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'free';
ALTER TABLE users ADD COLUMN plan_renewal_at INTEGER;
