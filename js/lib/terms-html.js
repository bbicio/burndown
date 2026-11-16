// The Terms & Conditions HTML as it may enter the DOM: DOMPurify with a text-only allowlist, or escaped text without it.

const CONFIG = {
  ALLOWED_TAGS: ['h1', 'h2', 'h3', 'h4', 'p', 'br', 'hr', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i', 'u',
    'blockquote', 'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
  ALLOWED_ATTR: ['href'],
  // an app path (not protocol-relative), https, http or mailto; any other href is removed
  ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|\/(?!\/))/i,
};

const escapeText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function safeTermsHtml(html) {
  if (typeof html !== 'string') return '';
  const purify = typeof window !== 'undefined' ? window.DOMPurify : undefined;
  if (!purify || typeof purify.sanitize !== 'function') return escapeText(html);
  return purify.sanitize(html, CONFIG);
}

if (typeof window !== 'undefined') window.safeTermsHtml = safeTermsHtml;
