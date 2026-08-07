// ── ROLES MODULE ──────────────────────────────────────────────────────────────
// Manages the global role registry used by Cost Grid to populate columns.
// Each role: { id, label, code, rate }

let roles = [];          // in-memory array, loaded by loadRolesFromApi()
let _roleEditId = null;  // ID of the role being edited (null = new)

// ── PERSISTENCE ──────────────────────────────────────────────────────────────

async function loadRolesFromApi() {
  try {
    const raw = await Api.roles.list();
    // Normalize API shape { id, label, code, team, hourly_rate } → app shape { id, label, code, rate }
    roles = raw.map(r => ({ id: r.id, label: r.label, code: r.code, rate: r.hourly_rate, rateOverrides: r.rate_overrides || {} }));
  } catch(e) {
    console.warn('[roles] loadRolesFromApi:', e.message);
    roles = [];
  }
}

function saveRoles() {
  // No-op: roles are persisted via the API.
}

function getRoles() {
  return roles;
}
