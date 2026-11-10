// js/lib/profile-ui.js
// Pure helpers of profile.html (My profile): the section from the URL hash, the password strength hint and
// the password form's state, the header initials. Native ES module, bridged onto `window`.

export const PROFILE_SECTIONS = ['details', 'password', 'privacy'];

export function sectionFromHash(hash) {
  const id = String(hash || '').replace(/^#/, '');
  return PROFILE_SECTIONS.includes(id) ? id : 'details';
}

// A hint only: the rule stays the server's minimum of 8 characters.
export function passwordStrength(pw) {
  const s = String(pw || '');
  if (!s) return 0;
  if (s.length < 8) return 1;
  let score = 1;
  if (s.length >= 12) score++;
  if (/\d/.test(s) && /[a-z]/i.test(s)) score++;
  if (/[a-z]/.test(s) && /[A-Z]/.test(s)) score++;
  if (/[^a-z0-9]/i.test(s)) score++;
  return Math.min(4, Math.max(2, score));
}

export function passwordFormState({ current, next, confirm }) {
  const mismatch = !!confirm && confirm !== next;
  const canSubmit = !!current && !!next && !!confirm && next.length >= 8 && !mismatch;
  return { mismatch, canSubmit };
}

export function maskInitials(user) {
  const i = `${(user?.first_name || '').trim().charAt(0)}${(user?.last_name || '').trim().charAt(0)}`.toUpperCase();
  return i || '?';
}

if (typeof window !== 'undefined') {
  window.PROFILE_SECTIONS = PROFILE_SECTIONS;
  window.sectionFromHash = sectionFromHash;
  window.passwordStrength = passwordStrength;
  window.passwordFormState = passwordFormState;
  window.maskInitials = maskInitials;
}
