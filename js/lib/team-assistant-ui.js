// Pure formatting helpers for the team assistant panel in planning.html (Cycle B). No DOM, no Vue:
// unit-tested with vitest and bridged to window.* for the page's inline script.

const escapeHtml = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Model text is untrusted: escape FIRST, then allow only **bold** and line breaks.
export function renderChatText(text) {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
}

const h = n => `${Math.round(n)} h`;
const list = (items, fmt) => (items && items.length ? items.map(fmt).join(', ') : '—');

export function rowView(row) {
  return {
    name: row.name,
    role: row.roleCode,
    score: Number(row.score).toFixed(1),
    roleHours: String(Math.round(row.roleHours)),
    tags: list(row.tags, t => `${t.value} (${h(t.hours)})`),
    projects: list(row.projects, p => `${p.name} (${h(p.hours)})`),
    tasks: list(row.tasks, t => `${t.name} (${h(t.hours)})`),
    topics: list(row.topics, t => `${t.name} (${t.kind})`),
    free: row.freeAvg == null ? '—' : `${Math.round(row.freeAvg)} avg / ${Math.round(row.freeMin)} min`,
    load: String(Math.round(row.currentLoad)),
    onProject: String(Math.round(row.hoursOnProject)),
    flags: (row.flags || []).join('; '),
    rationale: row.rationale,
  };
}

// projects: config.projects items ({ id, name, tasks: [{ completed, resources: [{ role, soldHours }] }] }).
export function projectOptions(projects) {
  return (projects || [])
    .filter(p => (p.tasks || []).some(t => !t.completed && (t.resources || []).some(r => r.role && Number(r.soldHours) > 0)))
    .map(p => ({ id: p.id, label: p.name || p.id }));
}

export function starterPrompts(roles) {
  const first = (roles && roles[0]) || 'a role';
  return [
    'Show the best team for this project',
    `Who is most available for ${first}?`,
    'Only people with experience in the same market and therapeutic area',
    'Exclude … and recalculate',
    'Why is … not among the best?',
  ];
}

export function tableTitle(key) {
  return { best: 'Best team', alternative: 'Alternative team', available: 'Available team' }[key] || key;
}

// A response that belongs to a project other than the one now selected must be discarded.
export function isStaleResponse(requestedProjectId, currentProjectId) {
  return requestedProjectId !== currentProjectId;
}

// What /chat receives: the last 20 real exchanges ({ role, content } only); local error bubbles never go back to the server.
export function chatPayload(messages) {
  return (messages || []).filter(m => !m.local).slice(-20).map(m => ({ role: m.role, content: m.content }));
}

// The project select follows the page filters: an empty selection is always valid, a chosen one only while it is still an option.
export function selectionStillValid(selectedId, options) {
  if (!selectedId) return true;
  return (options || []).some(o => o.id === selectedId);
}

// Enter sends; Shift+Enter is a newline; Enter that confirms an IME composition must not send (some IMEs report keyCode 229 with isComposing false).
export function shouldSendOnEnter(e) {
  return !!e && e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229;
}

window.renderChatText = renderChatText;
window.rowView = rowView;
window.projectOptions = projectOptions;
window.starterPrompts = starterPrompts;
window.tableTitle = tableTitle;
window.isStaleResponse = isStaleResponse;
window.chatPayload = chatPayload;
window.selectionStillValid = selectionStillValid;
window.shouldSendOnEnter = shouldSendOnEnter;
