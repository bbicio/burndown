// Rules that keep a project and the proposal it was generated from in the same currency, by inhibiting
// every way to create, unlink, delete or re-currency them (2026-10-01, see
// docs/superpowers/specs/2026-10-01-project-currency-lock-design.md). Pure functions: each returns an
// error message, or null when the action is allowed. A sysadmin (live role, read from the DB by the
// caller) is always allowed. Twin of js/lib/project-rules.js (the browser side).

// Single switch-back points (keep js/lib/project-rules.js in sync for the creation flag).
const DIRECT_PROJECT_CREATION_ENABLED = false;
const PROJECT_REMOVAL_ENABLED = false;

const MESSAGES = {
  versionCurrency: 'Currency cannot be changed: projects are linked to this proposal',
  projectCurrency: 'Currency cannot be changed: amounts are not converted yet',
  createNeedsProposal: 'Projects must be created from a proposal',
  removal: 'Deleting a project or unlinking it from its proposal is temporarily disabled',
  linkCurrency: 'The project and the proposal must have the same currency',
  versionNotFound: 'Proposal version not found',
};

// Carried in the body of every 400 these rules produce, so a client can tell a refusal from other
// errors (js/api-sync.js does not retry a refused PATCH as a POST).
const RULE_CODE = 'PROJECT_RULE';

const isSysadmin = role => role === 'sysadmin';
// The column default: a missing/empty currency means EUR.
const currencyOf = c => (c === undefined || c === null || c === '') ? 'EUR' : String(c);
const idOf = v => (v ? String(v).toLowerCase() : null);

function projectCreateError({ role, versionId, enabled = DIRECT_PROJECT_CREATION_ENABLED }) {
  if (isSysadmin(role) || enabled || versionId) return null;
  return MESSAGES.createNeedsProposal;
}

function projectCurrencyChangeError({ role, currentCurrency, newCurrency }) {
  if (isSysadmin(role)) return null;
  return currencyOf(currentCurrency) === currencyOf(newCurrency) ? null : MESSAGES.projectCurrency;
}

// Clearing the link or pointing it at another version is a removal of the current link; linking an
// unlinked project (null -> version) and re-sending the same id are not.
function projectLinkChangeError({ role, currentVersionId, newVersionId }) {
  if (isSysadmin(role)) return null;
  const current = idOf(currentVersionId);
  if (current && current !== idOf(newVersionId)) return MESSAGES.removal;
  return null;
}

// A project and the proposal it is linked to must have the same currency at link time.
function linkCurrencyError({ role, projectCurrency, versionCurrency }) {
  if (isSysadmin(role)) return null;
  return currencyOf(projectCurrency) === currencyOf(versionCurrency) ? null : MESSAGES.linkCurrency;
}

function versionCurrencyChangeError({ role, currentCurrency, newCurrency, hasProjects }) {
  if (isSysadmin(role) || !hasProjects) return null;
  return currencyOf(currentCurrency) === currencyOf(newCurrency) ? null : MESSAGES.versionCurrency;
}

function projectRemovalError({ role, enabled = PROJECT_REMOVAL_ENABLED }) {
  return (isSysadmin(role) || enabled) ? null : MESSAGES.removal;
}
const linkRemovalError = projectRemovalError;

function versionRemovalError({ role, hasProjects, enabled = PROJECT_REMOVAL_ENABLED }) {
  return (isSysadmin(role) || enabled || !hasProjects) ? null : MESSAGES.removal;
}

module.exports = {
  DIRECT_PROJECT_CREATION_ENABLED, PROJECT_REMOVAL_ENABLED, MESSAGES, RULE_CODE,
  projectCreateError, projectCurrencyChangeError, projectLinkChangeError, linkCurrencyError, versionCurrencyChangeError,
  projectRemovalError, linkRemovalError, versionRemovalError,
};
