import { describe, it, expect } from 'vitest';
import { OTP_LENGTH, normalizeDigits, applyInput, applyKey, isComplete } from './otp.js';

const empty = () => ['', '', '', '', '', ''];

describe('normalizeDigits', () => {
  it('keeps digits only, at most six', () => {
    expect(normalizeDigits('12a 3-4')).toBe('1234');
    expect(normalizeDigits('1234567890')).toBe('123456');
    expect(normalizeDigits(null)).toBe('');
  });
});

describe('applyInput', () => {
  it('a digit lands in its box and focus moves on', () => {
    const r = applyInput(empty(), 2, '5');
    expect(r.digits).toEqual(['', '', '5', '', '', '']);
    expect(r.focus).toBe(3);
  });

  it('pasting six digits at box 0 fills all and focuses the last', () => {
    const r = applyInput(empty(), 0, '123456');
    expect(r.digits).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(r.focus).toBe(5);
  });

  it('pasting three digits at box 4 fills 4 and 5 and ignores the rest', () => {
    const r = applyInput(empty(), 4, '987');
    expect(r.digits).toEqual(['', '', '', '', '9', '8']);
    expect(r.focus).toBe(5);
  });

  it('non-numeric text leaves the digits unchanged', () => {
    const start = ['1', '', '', '', '', ''];
    const r = applyInput(start, 1, 'x');
    expect(r.digits).toEqual(start);
    expect(r.focus).toBe(1);
  });

  it('does not mutate its input', () => {
    const start = empty();
    applyInput(start, 0, '1');
    expect(start).toEqual(empty());
  });
});

describe('applyKey', () => {
  it('Backspace on a full box empties it and stays', () => {
    const r = applyKey(['1', '2', '', '', '', ''], 1, 'Backspace');
    expect(r.digits).toEqual(['1', '', '', '', '', '']);
    expect(r.focus).toBe(1);
  });

  it('Backspace on an empty box empties the previous one and moves back', () => {
    const r = applyKey(['1', '2', '', '', '', ''], 2, 'Backspace');
    expect(r.digits).toEqual(['1', '', '', '', '', '']);
    expect(r.focus).toBe(1);
  });

  it('Backspace on an empty first box does nothing', () => {
    const r = applyKey(empty(), 0, 'Backspace');
    expect(r.digits).toEqual(empty());
    expect(r.focus).toBe(0);
  });

  it('arrows stay within 0..5', () => {
    expect(applyKey(empty(), 0, 'ArrowLeft').focus).toBe(0);
    expect(applyKey(empty(), 5, 'ArrowRight').focus).toBe(5);
    expect(applyKey(empty(), 2, 'ArrowRight').focus).toBe(3);
    expect(applyKey(empty(), 2, 'ArrowLeft').focus).toBe(1);
  });

  it('other keys are not handled', () => {
    expect(applyKey(empty(), 0, 'Enter')).toBeNull();
    expect(applyKey(empty(), 0, '5')).toBeNull();
  });
});

describe('isComplete', () => {
  it('is true only when all six boxes hold a digit', () => {
    expect(OTP_LENGTH).toBe(6);
    expect(isComplete(['1', '2', '3', '4', '5', '6'])).toBe(true);
    expect(isComplete(['1', '2', '3', '4', '5', ''])).toBe(false);
  });
});
