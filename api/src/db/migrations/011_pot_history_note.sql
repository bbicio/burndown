-- Migration 011: add note column to pot_history for change justification
ALTER TABLE pot_history ADD COLUMN IF NOT EXISTS note VARCHAR(500);
