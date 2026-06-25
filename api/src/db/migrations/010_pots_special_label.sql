-- Migration 010: add special_label to pots for virtual targets (Unassigned / New Biz)
ALTER TABLE pots ADD COLUMN IF NOT EXISTS special_label VARCHAR(255);
