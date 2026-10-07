const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('./project-rules');

const ADMIN = 'admin';
const SYS = 'sysadmin';
const V1 = '11111111-1111-1111-1111-111111111111';
const V2 = '22222222-2222-2222-2222-222222222222';

test('flags: direct creation and project removal are switched off', () => {
  assert.equal(rules.DIRECT_PROJECT_CREATION_ENABLED, false);
  assert.equal(rules.PROJECT_REMOVAL_ENABLED, false);
});

test('projectCreateError: no proposal is refused for non-sysadmin only', () => {
  assert.equal(rules.projectCreateError({ role: ADMIN, versionId: null }), rules.MESSAGES.createNeedsProposal);
  assert.equal(rules.projectCreateError({ role: 'user', versionId: '' }), rules.MESSAGES.createNeedsProposal);
  assert.equal(rules.projectCreateError({ role: ADMIN, versionId: V1 }), null);
  assert.equal(rules.projectCreateError({ role: SYS, versionId: null }), null);
  assert.equal(rules.projectCreateError({ role: ADMIN, versionId: null, enabled: true }), null);
});

test('projectCurrencyChangeError: a change is refused, an identical or EUR-default value passes', () => {
  const m = rules.MESSAGES.projectCurrency;
  assert.equal(rules.projectCurrencyChangeError({ role: ADMIN, currentCurrency: 'EUR', newCurrency: 'USD' }), m);
  assert.equal(rules.projectCurrencyChangeError({ role: ADMIN, currentCurrency: 'EUR', newCurrency: 'EUR' }), null);
  assert.equal(rules.projectCurrencyChangeError({ role: ADMIN, currentCurrency: 'EUR', newCurrency: '' }), null);
  assert.equal(rules.projectCurrencyChangeError({ role: ADMIN, currentCurrency: null, newCurrency: undefined }), null);
  assert.equal(rules.projectCurrencyChangeError({ role: ADMIN, currentCurrency: 'CHF', newCurrency: '' }), m);
  assert.equal(rules.projectCurrencyChangeError({ role: SYS, currentCurrency: 'EUR', newCurrency: 'USD' }), null);
});

test('projectLinkChangeError: clearing or re-pointing is refused; linking, same value and no link pass', () => {
  const m = rules.MESSAGES.removal;
  assert.equal(rules.projectLinkChangeError({ role: ADMIN, currentVersionId: V1, newVersionId: null }), m);
  assert.equal(rules.projectLinkChangeError({ role: ADMIN, currentVersionId: V1, newVersionId: '' }), m);
  assert.equal(rules.projectLinkChangeError({ role: ADMIN, currentVersionId: V1, newVersionId: V2 }), m);
  assert.equal(rules.projectLinkChangeError({ role: ADMIN, currentVersionId: V1, newVersionId: V1 }), null);
  assert.equal(rules.projectLinkChangeError({ role: ADMIN, currentVersionId: V1, newVersionId: V1.toUpperCase() }), null);
  assert.equal(rules.projectLinkChangeError({ role: ADMIN, currentVersionId: null, newVersionId: V1 }), null);
  assert.equal(rules.projectLinkChangeError({ role: ADMIN, currentVersionId: null, newVersionId: null }), null);
  assert.equal(rules.projectLinkChangeError({ role: SYS, currentVersionId: V1, newVersionId: null }), null);
});

test('linkCurrencyError: a project and its version must share the currency (non-sysadmin)', () => {
  const m = rules.MESSAGES.linkCurrency;
  assert.equal(rules.linkCurrencyError({ role: ADMIN, projectCurrency: 'EUR', versionCurrency: 'USD' }), m);
  assert.equal(rules.linkCurrencyError({ role: ADMIN, projectCurrency: 'USD', versionCurrency: 'USD' }), null);
  assert.equal(rules.linkCurrencyError({ role: ADMIN, projectCurrency: undefined, versionCurrency: 'EUR' }), null);
  assert.equal(rules.linkCurrencyError({ role: ADMIN, projectCurrency: '', versionCurrency: 'USD' }), m);
  assert.equal(rules.linkCurrencyError({ role: SYS, projectCurrency: 'EUR', versionCurrency: 'USD' }), null);
});

test('rule messages are carried with the PROJECT_RULE code constant', () => {
  assert.equal(rules.RULE_CODE, 'PROJECT_RULE');
  assert.equal(rules.MESSAGES.versionNotFound, 'Proposal version not found');
});

test('versionCurrencyChangeError: only a version with projects is protected', () => {
  const m = rules.MESSAGES.versionCurrency;
  assert.equal(rules.versionCurrencyChangeError({ role: ADMIN, currentCurrency: 'EUR', newCurrency: 'USD', hasProjects: true }), m);
  assert.equal(rules.versionCurrencyChangeError({ role: ADMIN, currentCurrency: 'EUR', newCurrency: 'EUR', hasProjects: true }), null);
  assert.equal(rules.versionCurrencyChangeError({ role: ADMIN, currentCurrency: 'EUR', newCurrency: 'USD', hasProjects: false }), null);
  assert.equal(rules.versionCurrencyChangeError({ role: SYS, currentCurrency: 'EUR', newCurrency: 'USD', hasProjects: true }), null);
});

test('removal rules: refused for non-sysadmin while the flag is off', () => {
  const m = rules.MESSAGES.removal;
  assert.equal(rules.projectRemovalError({ role: ADMIN }), m);
  assert.equal(rules.linkRemovalError({ role: 'user' }), m);
  assert.equal(rules.projectRemovalError({ role: SYS }), null);
  assert.equal(rules.projectRemovalError({ role: ADMIN, enabled: true }), null);
  assert.equal(rules.versionRemovalError({ role: ADMIN, hasProjects: true }), m);
  assert.equal(rules.versionRemovalError({ role: ADMIN, hasProjects: false }), null);
  assert.equal(rules.versionRemovalError({ role: SYS, hasProjects: true }), null);
  assert.equal(rules.versionRemovalError({ role: ADMIN, hasProjects: true, enabled: true }), null);
});

test('a missing role (deleted user) is treated as non-sysadmin', () => {
  assert.equal(rules.projectRemovalError({ role: null }), rules.MESSAGES.removal);
});

test('versionCreationError: a published proposal refuses a new version for non-sysadmin only', () => {
  const m = 'A published proposal cannot get a new version.';
  assert.equal(rules.versionCreationError({ role: ADMIN, hasPublishedVersion: false }), null);
  assert.equal(rules.versionCreationError({ role: ADMIN, hasPublishedVersion: true }), m);
  assert.equal(rules.versionCreationError({ role: 'user', hasPublishedVersion: true }), m);
  assert.equal(rules.versionCreationError({ role: SYS, hasPublishedVersion: true }), null);
});

test('VERSION_RULE_CODE constant', () => {
  assert.equal(rules.VERSION_RULE_CODE, 'VERSION_RULE');
});
