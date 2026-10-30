// ── RATECARDS ──────────────────────────────────────────────────────────────────
// Shared loader for the cost grid's Ratecard dropdown. The rate card editor lives in
// master-clients.html (Master Data → Clients → Rate Card).

// ── LOAD FOR COSTGRID DROPDOWN ────────────────────────────────────────────────

let _rcDropdownCache = null;

async function loadRatecardsForDropdown() {
  if (_rcDropdownCache) return _rcDropdownCache;
  try {
    _rcDropdownCache = await Api.ratecards.list();
    return _rcDropdownCache;
  } catch {
    return [];
  }
}
