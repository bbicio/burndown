// js/lib/project-rules.js
// Browser side of the project currency lock (2026-10-01, docs/superpowers/specs/2026-10-01-project-currency-lock-design.md).
// Loaded as a native ES module and bridged onto `window` for the Vue pages (read the bridges only inside
// functions that run after DOMContentLoaded). Twin of api/src/lib/project-rules.js: the server is the
// authority, this only drives what the UI shows. Keep DIRECT_PROJECT_CREATION_ENABLED in sync by hand.

// Single switch-back point for the UI: set to true (and the server flag too) to allow projects
// without a proposal again.
export const DIRECT_PROJECT_CREATION_ENABLED = false;

export const PROJECT_RULE_MESSAGES = {
  costgridCurrency: 'Currency is locked: a project has already been generated from this proposal.',
  projectConfigCurrency: 'Currency cannot be changed here: amounts are not converted yet. Contact a sysadmin if it must be corrected.',
  directCreation: 'Projects are created from a proposal (Generate project). Creating a project directly is temporarily disabled.',
};

// A version's currency is locked as soon as it has a linked project (draft.linkedProjects).
export function versionCurrencyLocked(linkedProjects) {
  return Array.isArray(linkedProjects) && linkedProjects.length > 0;
}

if (typeof window !== 'undefined') {
  window.DIRECT_PROJECT_CREATION_ENABLED = DIRECT_PROJECT_CREATION_ENABLED;
  window.PROJECT_RULE_MESSAGES = PROJECT_RULE_MESSAGES;
  window.versionCurrencyLocked = versionCurrencyLocked;
}
