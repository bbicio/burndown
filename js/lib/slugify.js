// js/lib/slugify.js
// Client twin of api/src/lib/slugify.js, for the New list slug preview on attribute-lists.html. Keep the two
// identical: js/lib/slugify.test.js compares their output. Native ES module, bridged onto `window`.

export function slugify(name) {
  return String(name || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

window.slugify = slugify;
