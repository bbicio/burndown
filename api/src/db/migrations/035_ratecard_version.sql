-- B-209: optimistic version of a rate card. PATCH /api/ratecards/:id/entries refuses a save made
-- from a copy older than the stored one (409 RATECARD_STALE); each successful save adds 1.
-- Existing cards start at 0. Re-runnable.
ALTER TABLE ratecards ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 0;
