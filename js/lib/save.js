// js/lib/save.js
// The save contract on the client: apiSave(method, path, body) writes through window.apiFetch
// (overlay, 401 redirect and timeout stay there) and never throws. It answers one outcome:
//   ok       — 2xx JSON (or an empty body): { data }
//   conflict — 409 STALE: { message, version }; the page offers Reload
//   rule     — a *_RULE refusal: { code, message }
//   error    — any other HTTP error, a 4xx that is not JSON, a 401: { status, message }
//   unknown  — timeout, network, a 5xx or 2xx that is not JSON: the write may have happened
// Loaded as an ES module (<script type="module" src="js/lib/save.js?v=N">) and bridged onto `window`.

export const UNKNOWN_MESSAGE = "The server's answer was lost — the change may have been saved. Reload to check.";

export async function apiSave(method, path, body) {
  try {
    const data = await window.apiFetch(path, { method, body: body == null ? undefined : JSON.stringify(body) });
    return { kind: 'ok', data };
  } catch (err) {
    const status = err?.status;
    if (err?.timeout || err?.network || (err?.nonJson && (status >= 500 || status < 400))) {
      return { kind: 'unknown', message: UNKNOWN_MESSAGE };
    }
    const data = err?.data;
    const message = data?.error || err?.message || (status ? `HTTP ${status}` : 'Unknown error');
    if (status === 409 && data?.code === 'STALE') return { kind: 'conflict', message, version: data.version };
    if (/_RULE$/.test(data?.code || '')) return { kind: 'rule', code: data.code, message };
    return { kind: 'error', status, message };
  }
}

window.apiSave = apiSave;
