// js/lib/profile-ui.js
// Pure helpers of profile.html (My profile): the section from the URL hash, the password form's state (the rule
// and the strength meter come from ./password-policy.js), the header initials, the expiry line of a trusted
// device. Native ES module, bridged onto `window`.

import { formatDayText } from './dates.js?v=7';
import { passwordError } from './password-policy.js?v=1';

export const PROFILE_SECTIONS = ['details', 'password', 'two-step', 'devices', 'privacy'];

export function sectionFromHash(hash) {
  const id = String(hash || '').replace(/^#/, '');
  return PROFILE_SECTIONS.includes(id) ? id : 'details';
}

export function passwordFormState({ current, next, confirm }, context = {}) {
  const mismatch = !!confirm && confirm !== next;
  const ruleError = next ? (passwordError(next, context)?.message || '') : '';
  const canSubmit = !!current && !!next && !!confirm && !ruleError && !mismatch;
  return { mismatch, ruleError, canSubmit };
}

export function maskInitials(user) {
  const i = `${(user?.first_name || '').trim().charAt(0)}${(user?.last_name || '').trim().charAt(0)}`.toUpperCase();
  return i || '?';
}

const DAY_MS = 24 * 60 * 60 * 1000;
const SOON_DAYS = 10;

// "expires in 3 days" (amber) under SOON_DAYS, "expires Dec 2, 2026" from there on.
export function deviceExpiry(expiresAt, now = Date.now()) {
  const days = Math.max(1, Math.ceil((new Date(expiresAt).getTime() - now) / DAY_MS));
  if (days < SOON_DAYS) return { soon: true, text: `expires in ${days} ${days === 1 ? 'day' : 'days'}` };
  return { soon: false, text: `expires ${formatDayText(String(expiresAt).slice(0, 10))}` };
}

if (typeof window !== 'undefined') {
  window.PROFILE_SECTIONS = PROFILE_SECTIONS;
  window.sectionFromHash = sectionFromHash;
  window.passwordFormState = passwordFormState;
  window.maskInitials = maskInitials;
  window.deviceExpiry = deviceExpiry;
}
