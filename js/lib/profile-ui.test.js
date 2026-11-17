import { describe, it, expect } from 'vitest';
import { PROFILE_SECTIONS, sectionFromHash, passwordFormState, maskInitials, deviceExpiry } from './profile-ui.js';

describe('sectionFromHash', () => {
  it('maps a known hash to its section', () => {
    expect(PROFILE_SECTIONS).toEqual(['details', 'password', 'two-step', 'devices', 'privacy']);
    expect(sectionFromHash('#privacy')).toBe('privacy');
    expect(sectionFromHash('#devices')).toBe('devices');
    expect(sectionFromHash('#two-step')).toBe('two-step');
    expect(sectionFromHash('#password')).toBe('password');
  });
  it('falls back to details for an empty, bare or unknown hash', () => {
    for (const h of ['', '#', '#foo', undefined, null]) expect(sectionFromHash(h)).toBe('details');
  });
});

describe('deviceExpiry', () => {
  const now = Date.parse('2026-11-10T12:00:00Z');
  const inDays = n => new Date(now + n * 86400000).toISOString();

  it('says "in N days" and flags it soon under 10 days', () => {
    expect(deviceExpiry(inDays(3), now)).toEqual({ soon: true, text: 'expires in 3 days' });
    expect(deviceExpiry(inDays(9), now)).toEqual({ soon: true, text: 'expires in 9 days' });
  });
  it('uses the singular for one day, and never goes below it', () => {
    expect(deviceExpiry(inDays(1), now)).toEqual({ soon: true, text: 'expires in 1 day' });
    expect(deviceExpiry(inDays(0.2), now)).toEqual({ soon: true, text: 'expires in 1 day' });
  });
  it('shows the date from 10 days on, not soon', () => {
    const r = deviceExpiry(inDays(20), now);
    expect(r.soon).toBe(false);
    expect(r.text).toBe('expires Nov 30, 2026');
    expect(deviceExpiry(inDays(10), now).soon).toBe(false);
  });
});

describe('passwordFormState', () => {
  it('flags a mismatching confirmation and blocks submit', () => {
    expect(passwordFormState({ current: 'a', next: 'k7wq9vzm2pqx', confirm: 'k7wq9vzm2pqy' }))
      .toEqual({ mismatch: true, ruleError: '', canSubmit: false });
  });
  it('allows submit when the three fields are filled, coherent and the rule is met', () => {
    expect(passwordFormState({ current: 'a', next: 'k7wq9vzm2pqx', confirm: 'k7wq9vzm2pqx' }))
      .toEqual({ mismatch: false, ruleError: '', canSubmit: true });
  });
  it('blocks a new password the rule refuses, and says why', () => {
    expect(passwordFormState({ current: 'a', next: 'abcdefgh', confirm: 'abcdefgh' }))
      .toEqual({ mismatch: false, ruleError: 'Use at least 12 characters.', canSubmit: false });
  });
  it('blocks a new password that contains the user name', () => {
    const st = passwordFormState({ current: 'a', next: 'Rossi-k7#wq9vz', confirm: 'Rossi-k7#wq9vz' }, { lastName: 'Rossi' });
    expect(st.canSubmit).toBe(false);
    expect(st.ruleError).toBe("Don't use your name or email in your password.");
  });
  it('says nothing while the new password is empty, and blocks an empty field', () => {
    expect(passwordFormState({ current: 'a', next: '', confirm: '' })).toEqual({ mismatch: false, ruleError: '', canSubmit: false });
    expect(passwordFormState({ current: '', next: 'k7wq9vzm2pqx', confirm: 'k7wq9vzm2pqx' }).canSubmit).toBe(false);
    expect(passwordFormState({ current: 'a', next: 'k7wq9vzm2pqx', confirm: '' })).toEqual({ mismatch: false, ruleError: '', canSubmit: false });
  });
});

describe('maskInitials', () => {
  it('takes the first letters of first and last name', () => {
    expect(maskInitials({ first_name: 'ada', last_name: 'Lovelace' })).toBe('AL');
  });
  it('answers ? when there is no name', () => {
    expect(maskInitials({ first_name: '', last_name: '' })).toBe('?');
    expect(maskInitials(null)).toBe('?');
  });
});
