CREATE TABLE IF NOT EXISTS cost_grid_version_tags (
  version_id UUID NOT NULL REFERENCES cost_grid_versions(id) ON DELETE CASCADE,
  item_id    UUID NOT NULL REFERENCES attribute_list_items(id),
  PRIMARY KEY (version_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_cost_grid_version_tags_item_id ON cost_grid_version_tags(item_id);

CREATE TABLE IF NOT EXISTS project_tags (
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  item_id    UUID NOT NULL REFERENCES attribute_list_items(id),
  PRIMARY KEY (project_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_project_tags_item_id ON project_tags(item_id);
