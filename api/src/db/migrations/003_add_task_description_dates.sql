-- Migration 003: add description, start_date, end_date to tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS start_date  VARCHAR(8)  NOT NULL DEFAULT '';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS end_date    VARCHAR(8)  NOT NULL DEFAULT '';
