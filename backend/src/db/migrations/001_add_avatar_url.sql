-- Migration: Add avatar_url column to users table
-- Run this on Supabase SQL Editor

ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Verify the column exists
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'users' AND column_name = 'avatar_url';
