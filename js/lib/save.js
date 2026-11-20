// js/lib/save.js
// The save contract on the client: apiSave(method, path, body, opts) writes through window.apiFetch
// (overlay, 401 redirect and timeout stay there) and never throws. It answers one outcome:
//   ok       — 2xx JSON (or an empty body): { data }
//   conflict — 409 STALE: { message, version }; the page offers Reload
//   rule     — a *_RULE refusal: { code, message }
//   error    — any other 4xx (JSON or not), a 401: { status, message, data } (data: the parsed body, or null)
//   unknown  — timeout, network, any 5xx, a 2xx that is not JSON: the write may have happened
// opts.background: true keeps the write out of the save overlay (apiFetch's `background`).
// Loaded as an ES module (<script type="module" src="js/lib/save.js?v=N">) and bridged onto `window`.

export const UNKNOWN_MESSAGE = "The server's answer was lost — the change may have been saved. Reload to check.";

export async function apiSave(method, path, body, opts) {
  try {
    const data = await window.apiFetch(path, { method, body: body == null ? undefined : JSON.stringify(body), background: opts?.background === true });
    return { kind: 'ok', data };
  } catch (err) {
    const status = err?.status;
    if (err?.timeout || err?.network || status >= 500 || (err?.nonJson && status < 400)) {
      return { kind: 'unknown', message: UNKNOWN_MESSAGE };
    }
    const data = err?.data;
    const message = data?.error || err?.message || (status ? `HTTP ${status}` : 'Unknown error');
    if (status === 409 && data?.code === 'STALE') return { kind: 'conflict', message, version: data.version };
    if (/_RULE$/.test(data?.code || '')) return { kind: 'rule', code: data.code, message };
    return { kind: 'error', status, message, data: data ?? null };
  }
}

// saveAndReload(method, path, body, reload, opts) writes with apiSave, then runs reload() only after an
// `ok` or an `unknown` outcome (the write may have happened). It answers { ...outcome, reloaded }:
// reloaded is true when reload() did not throw and resolved a value !== false; with any other outcome
// reload() is not called and reloaded is false. Pages show SAVED_NOT_RELOADED when ok but not reloaded.
export const SAVED_NOT_RELOADED = "Saved, but the list couldn't be reloaded. Reload the page to see the latest.";

export async function saveAndReload(method, path, body, reload, opts) {
  const out = await apiSave(method, path, body, opts);
  if (out.kind !== 'ok' && out.kind !== 'unknown') return { ...out, reloaded: false };
  let reloaded = false;
  try { reloaded = (await reload()) !== false; } catch (e) { reloaded = false; }
  return { ...out, reloaded };
}

window.apiSave = apiSave;
window.saveAndReload = saveAndReload;
window.SAVED_NOT_RELOADED = SAVED_NOT_RELOADED;
