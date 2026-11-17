-- Save contract: an optimistic version on every saved entity (ratecards has it since 035) and the
-- change_log register, one full snapshot per successful save, written in the save's transaction. Re-runnable.
ALTER TABLE roles              ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 0;
ALTER TABLE programs           ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 0;
ALTER TABLE projects           ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 0;
ALTER TABLE cost_grids         ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 0;
ALTER TABLE cost_grid_versions ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS change_log (
  id          bigserial PRIMARY KEY,
  entity_type text        NOT NULL,
  entity_id   text        NOT NULL,
  version     integer     NOT NULL,
  action      text        NOT NULL,
  user_id     uuid        REFERENCES users(id) ON DELETE SET NULL,
  at          timestamptz NOT NULL DEFAULT now(),
  snapshot    jsonb       NOT NULL
);
CREATE INDEX IF NOT EXISTS change_log_entity_idx ON change_log (entity_type, entity_id, version);
