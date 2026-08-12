// ── PROGRAMS MODULE ───────────────────────────────────────────────────────────
// Manages parent programs that group multiple projects.
// Each program: { id, name }

let _programs = [];

// ── PERSISTENCE ───────────────────────────────────────────────────────────────

async function loadProgramsFromApi() {
  try {
    _programs = await Api.programs.list();
  } catch(e) {
    console.warn('[programs] loadProgramsFromApi:', e.message);
    _programs = [];
  }
}

function savePrograms() {
  // No-op: programs are persisted via the API.
}

function getPrograms() {
  return _programs;
}
