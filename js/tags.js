// Loads every attribute list with its active items, shaped for a tag-assignment UI.
// Talks to /api/attribute-lists directly with fetch (not the Api.* wrapper), matching
// how attribute-lists.html itself already calls these same endpoints. Not cached —
// each consumer page calls this once per page load, same as its own clients/programs lists.
async function loadActiveAttributeListsForTagging() {
  const listsRes = await fetch('/api/attribute-lists', { credentials: 'same-origin' });
  if (!listsRes.ok) throw new Error('Failed to load attribute lists');
  const lists = await listsRes.json();

  const result = [];
  for (const list of lists) {
    const itemsRes = await fetch(`/api/attribute-lists/${list.id}/items`, { credentials: 'same-origin' });
    if (!itemsRes.ok) throw new Error(`Failed to load items for list "${list.name}"`);
    const items = await itemsRes.json();
    result.push({
      id: list.id,
      name: list.name,
      slug: list.slug,
      items: items.filter(i => i.status === 'active'),
    });
  }
  return result;
}
