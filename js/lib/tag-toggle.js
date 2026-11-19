// js/lib/tag-toggle.js
// One tag, one write: tagToggle({ basePath, rows, itemId }) removes the item when `rows` has it
// (DELETE <basePath>/<itemId>) and adds it otherwise (PUT), through window.apiSave in the background
// (no save overlay). basePath is `/projects/<id>/tags` or `/cost-grids/<cgId>/versions/<vId>/tags`.
// It answers { rows } — the server's full tag list — on success, or { message } on any other outcome.
// Loaded as an ES module (<script type="module" src="js/lib/tag-toggle.js?v=N">) and bridged onto `window`.

export async function tagToggle({ basePath, rows, itemId }) {
  const on = rows.some(r => r.item_id === itemId);
  const out = await window.apiSave(on ? 'DELETE' : 'PUT', `${basePath}/${itemId}`, null, { background: true });
  return out.kind === 'ok' ? { rows: out.data } : { message: out.message };
}

window.tagToggle = tagToggle;
