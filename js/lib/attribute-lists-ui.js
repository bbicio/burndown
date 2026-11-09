// js/lib/attribute-lists-ui.js
// Pure helpers for attribute-lists.html: item and topic counts, search filters, topic ordering, banner texts and
// the merge targets offered to combo-select. No DOM, no Vue. Native ES module, bridged onto `window`.

function fold(s) {
  return String(s ?? '').normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase().trim();
}

function cmp(a, b) {
  return String(a ?? '').localeCompare(String(b ?? ''), undefined, { sensitivity: 'base' });
}

const matches = (label, text) => fold(label).includes(fold(text));

// Counts per status over the items whose label contains `text`.
export function itemCounts(items, text = '') {
  const hit = items.filter(i => matches(i.label, text));
  const active = hit.filter(i => i.status === 'active').length;
  return { active, inactive: hit.length - active, all: hit.length };
}

// status: 'active' | 'inactive' | 'all'. Keeps the input order.
export function filterItems(items, { status = 'active', text = '' } = {}) {
  return items.filter(i => (status === 'all' || i.status === status) && matches(i.label, text));
}

export function topicCounts(topics) {
  const out = { proposed: 0, approved: 0, rejected: 0 };
  for (const t of topics) if (t.status in out) out[t.status]++;
  return out;
}

// Proposed topics by usage (most used first) then name; the other states by name.
export function filterTopics(topics, { status, text = '' } = {}) {
  const list = topics.filter(t => t.status === status && matches(t.name, text));
  const byName = (a, b) => cmp(a.name, b.name);
  return list.sort(status === 'proposed'
    ? (a, b) => ((Number(b.usage_count) || 0) - (Number(a.usage_count) || 0)) || byName(a, b)
    : byName);
}

export function descriptionsText(n) {
  return Number(n) === 1 ? '1 description' : `${Number(n) || 0} descriptions`;
}

// Options for combo-select: approved topics, then (for a proposed source only) proposed ones; never the source
// itself nor a rejected topic.
export function mergeTargetOptions(topics, source) {
  const group = status => topics
    .filter(t => t.status === status && t.id !== source.id)
    .sort((a, b) => cmp(a.name, b.name))
    .map(t => ({ id: t.id, label: t.name, hint: descriptionsText(t.usage_count) }));
  const out = [{ group: 'Approved' }, ...group('approved')];
  if (source.status === 'proposed') out.push({ group: 'Proposed' }, ...group('proposed'));
  return out;
}

export function emptyItemsLine(status, text) {
  const word = status === 'all' ? '' : `${status} `;
  const q = String(text ?? '').trim();
  return q ? `No ${word}values contain "${q}".` : `There are no ${word}values in this list.`;
}

window.itemCounts = itemCounts;
window.filterItems = filterItems;
window.topicCounts = topicCounts;
window.filterTopics = filterTopics;
window.descriptionsText = descriptionsText;
window.mergeTargetOptions = mergeTargetOptions;
window.emptyItemsLine = emptyItemsLine;
