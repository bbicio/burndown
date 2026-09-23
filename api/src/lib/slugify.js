// Turns a display name into a stable, URL/identifier-safe slug. Used once,
// at attribute_lists creation time — the slug is stored and never
// regenerated, so this function's output for a given input must never
// change once anything relies on it.
function slugify(name) {
  return String(name || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

module.exports = { slugify };
