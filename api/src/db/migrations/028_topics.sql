-- Profile descriptions cycle: shared competence vocabulary + per-description extraction state/links.
CREATE TABLE IF NOT EXISTS topics (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            VARCHAR(100) NOT NULL,
  name_normalized VARCHAR(100) NOT NULL UNIQUE,
  status          VARCHAR(20)  NOT NULL DEFAULT 'proposed' CHECK (status IN ('approved', 'proposed', 'rejected')),
  merged_into     UUID REFERENCES topics(id),
  created_by      UUID REFERENCES users(id),
  updated_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT topics_no_self_merge CHECK (merged_into IS NULL OR merged_into <> id)
);
CREATE INDEX IF NOT EXISTS idx_topics_status ON topics(status);

-- task_key '' = the project description; otherwise the normalised task name (task ids are NOT stable:
-- PUT /api/projects/:id/tasks deletes and re-inserts every task on each save).
CREATE TABLE IF NOT EXISTS description_topic_state (
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_key     TEXT NOT NULL DEFAULT '',
  text_hash    TEXT NOT NULL DEFAULT '',
  extracted_at TIMESTAMPTZ,
  last_error   TEXT,
  PRIMARY KEY (project_id, task_key)
);

CREATE TABLE IF NOT EXISTS description_topic_links (
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_key   TEXT NOT NULL DEFAULT '',
  topic_id   UUID NOT NULL REFERENCES topics(id),
  PRIMARY KEY (project_id, task_key, topic_id)
);
CREATE INDEX IF NOT EXISTS idx_dtl_topic ON description_topic_links(topic_id);

INSERT INTO app_settings (key, value) VALUES ('topic_extraction_enabled', 'true')
ON CONFLICT (key) DO NOTHING;
