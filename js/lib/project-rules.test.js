import { describe, it, expect } from 'vitest';
import { DIRECT_PROJECT_CREATION_ENABLED, PROJECT_RULE_MESSAGES, versionCurrencyLocked } from './project-rules.js';

describe('versionCurrencyLocked', () => {
  it('is locked as soon as a project is linked', () => {
    expect(versionCurrencyLocked([{ projectId: 'p1' }])).toBe(true);
    expect(versionCurrencyLocked([{ projectId: 'p1' }, { projectId: 'p2' }])).toBe(true);
  });
  it('is not locked without projects, or when the list is missing', () => {
    expect(versionCurrencyLocked([])).toBe(false);
    expect(versionCurrencyLocked(undefined)).toBe(false);
    expect(versionCurrencyLocked(null)).toBe(false);
  });
});

describe('flags and messages', () => {
  it('direct project creation is switched off', () => {
    expect(DIRECT_PROJECT_CREATION_ENABLED).toBe(false);
  });
  it('carries the approved texts', () => {
    expect(PROJECT_RULE_MESSAGES.costgridCurrency).toBe('Currency is locked: a project has already been generated from this proposal.');
    expect(PROJECT_RULE_MESSAGES.projectConfigCurrency).toBe('Currency cannot be changed here: amounts are not converted yet. Contact a sysadmin if it must be corrected.');
    expect(PROJECT_RULE_MESSAGES.directCreation).toBe('Projects are created from a proposal (Generate project). Creating a project directly is temporarily disabled.');
  });
  it('is bridged onto window for the classic page code', () => {
    expect(window.versionCurrencyLocked).toBe(versionCurrencyLocked);
    expect(window.DIRECT_PROJECT_CREATION_ENABLED).toBe(false);
    expect(window.PROJECT_RULE_MESSAGES).toBe(PROJECT_RULE_MESSAGES);
  });
});
