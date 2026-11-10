// js/lib/otp.js
// Pure logic of the six-box code input (js/otp-input.js): digits only, paste/autofill from any box,
// Backspace and arrows. Native ES module, bridged onto `window`.

export const OTP_LENGTH = 6;

export function normalizeDigits(text) {
  return String(text == null ? '' : text).replace(/\D/g, '').slice(0, OTP_LENGTH);
}

const clamp = i => Math.min(OTP_LENGTH - 1, Math.max(0, i));

// Typing, pasting or autofilling `text` into box `index`: the digits fill from `index` on, the rest is dropped.
export function applyInput(digits, index, text) {
  const typed = normalizeDigits(text);
  const next = digits.slice();
  if (!typed) return { digits: next, focus: index };
  let last = index;
  for (let k = 0; k < typed.length && index + k < OTP_LENGTH; k++) {
    next[index + k] = typed[k];
    last = index + k;
  }
  return { digits: next, focus: clamp(last + 1) };
}

// `null` = the key is not handled here.
export function applyKey(digits, index, key) {
  const next = digits.slice();
  if (key === 'Backspace') {
    if (next[index]) {
      next[index] = '';
      return { digits: next, focus: index };
    }
    if (index === 0) return { digits: next, focus: 0 };
    next[index - 1] = '';
    return { digits: next, focus: index - 1 };
  }
  if (key === 'ArrowLeft') return { digits: next, focus: clamp(index - 1) };
  if (key === 'ArrowRight') return { digits: next, focus: clamp(index + 1) };
  return null;
}

export function isComplete(digits) {
  return digits.length === OTP_LENGTH && digits.every(d => /^\d$/.test(d));
}

window.OTP_LENGTH = OTP_LENGTH;
window.normalizeDigits = normalizeDigits;
window.applyInput = applyInput;
window.applyKey = applyKey;
window.isComplete = isComplete;
