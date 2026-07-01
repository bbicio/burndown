-- Migration 013: add rate_overrides JSONB to roles table
-- Stores per-currency default agency rates, e.g. { "USD": 140, "GBP": 110 }
ALTER TABLE roles ADD COLUMN IF NOT EXISTS rate_overrides JSONB NOT NULL DEFAULT '{}';
