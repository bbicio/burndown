-- Add D365 Project ID code field (separate from the internal UUID primary key)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS code VARCHAR(100);
