CREATE UNIQUE INDEX IF NOT EXISTS uq_attribute_list_items_list_id_label
  ON attribute_list_items (list_id, lower(label));
