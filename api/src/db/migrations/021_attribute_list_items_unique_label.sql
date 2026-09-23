-- Disambiguate any pre-existing case-insensitive duplicate labels within the same list
-- (possible before this migration, since no uniqueness constraint existed) so the unique
-- index below never fails to create. The oldest row per (list_id, lower(label)) keeps its
-- label; later duplicates are suffixed — admins can rename them via the existing UI.
WITH duplicates AS (
  SELECT id, label,
         ROW_NUMBER() OVER (PARTITION BY list_id, lower(label) ORDER BY created_at, id) AS rn
  FROM attribute_list_items
)
UPDATE attribute_list_items ali
SET label = left(ali.label, 255 - length(' (duplicate ' || duplicates.rn || ')')) || ' (duplicate ' || duplicates.rn || ')'
FROM duplicates
WHERE ali.id = duplicates.id AND duplicates.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_attribute_list_items_list_id_label
  ON attribute_list_items (list_id, lower(label));
