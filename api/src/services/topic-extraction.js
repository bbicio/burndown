// DB-bound half of the topic-extraction feature. Pure logic lives in ../lib/topic-extract.js.
const { pool, query } = require('../db/client');
const { buildVocabulary } = require('../lib/topic-extract');

// q = query or a transaction client's bound query. Vocabulary = every topic row + every attribute
// list name and ACTIVE item label (the values a topic may never equal).
async function loadVocabulary(q = query) {
  const [topics, lists] = await Promise.all([
    q('SELECT id, name, name_normalized, status, merged_into FROM topics'),
    q(`SELECT al.name AS list_name, ali.label
       FROM attribute_lists al
       LEFT JOIN attribute_list_items ali ON ali.list_id = al.id AND ali.status = 'active'`),
  ]);
  return buildVocabulary(topics.rows, lists.rows);
}

module.exports = { loadVocabulary };
