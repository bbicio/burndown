import { describe, it, expect } from 'vitest';
import { PROFILE_SECTIONS, sectionFromHash, passwordStrength, passwordFormState, maskInitials } from './profile-ui.js';

describe('sectionFromHash', () => {
  it('maps a known hash to its section', () => {
    expect(PROFILE_SECTIONS).toEqual(['details', 'password', 'privacy']);
    expect(sectionFromHash('#privacy')).toBe('privacy');
    expect(sectionFromHash('#password')).toBe('password');
  });
  it('falls back to details for an empty, bare or unknown hash', () => {
    for (const h of ['', '#', '#foo', undefined, null]) expect(sectionFromHash(h)).toBe('details');
  });
});

describe('passwordStrength', () => {
  it('scores empty, short, 8 letters only and a long mixed password', () => {
    expect(passwordStrength('')).toBe(0);
    expect(passwordStrength('abc')).toBe(1);
    expect(passwordStrength('abcdefgh')).toBe(2);
    expect(passwordStrength('Abcdefgh1234!')).toBe(4);
  });
  it('stays at 1 under 8 characters, however varied', () => {
    expect(passwordStrength('Ab1!')).toBe(1);
  });
  it('adds a point per criterion from 8 characters up', () => {
    expect(passwordStrength('abcdefg1')).toBe(2);
    expect(passwordStrength('Abcdefg1')).toBe(3);
  });
});

describe('passwordFormState', () => {
  it('flags a mismatching confirmation and blocks submit', () => {
    expect(passwordFormState({ current: 'a', next: 'abcdefgh', confirm: 'abcdefgx' })).toEqual({ mismatch: true, canSubmit: false });
  });
  it('allows submit when the three fields are filled and coherent', () => {
    expect(passwordFormState({ current: 'a', next: 'abcdefgh', confirm: 'abcdefgh' })).toEqual({ mismatch: false, canSubmit: true });
  });
  it('blocks a new password under 8 characters, an empty field, and says no mismatch while confirm is empty', () => {
    expect(passwordFormState({ current: 'a', next: 'abcdefg', confirm: 'abcdefg' }).canSubmit).toBe(false);
    expect(passwordFormState({ current: '', next: 'abcdefgh', confirm: 'abcdefgh' }).canSubmit).toBe(false);
    expect(passwordFormState({ current: 'a', next: 'abcdefgh', confirm: '' })).toEqual({ mismatch: false, canSubmit: false });
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
