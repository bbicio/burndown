// JavaScript source reduced to its code, for guards that look for statements with a regex.
// Comments are dropped; string literals keep their text only when it is a short word (`'anonymous'`,
// `"crossorigin"`), so a statement quoted in a string or a help text never reads as code; template
// literals and regex literals are blanked (`` ` ` ``, `/r/`).
//
// Not a parser -- named limits: a `/` after `)` is read as division, so `if (x) /re/.test(s)` is
// mis-tokenised; a template literal ends at its first unescaped backtick, so a template nested in
// `${...}` is mis-tokenised; HTML-in-JS and JSX are not handled. Each errs on the code being blanked
// or kept as text, never on text becoming code, except where a mis-tokenised `/` or backtick shifts
// what follows.
//
// Not the same helper as js/lib/page-head-guard.test.js's stripComments, which strips CSS comments.

const WORD = /^[\w-]*$/;
const REGEX_PREV = new Set([...'(,=:[!&|?{};+-*%<>~^']);
const REGEX_KEYWORDS = /(?:^|[^\w$])(?:return|typeof|case|do|else|in|of|void|yield|await|delete|new|throw)$/;

export function jsCode(src) {
  let out = '';
  let i = 0;
  const prevSignificant = () => out.replace(/\s+$/, '');
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') i++;
    } else if (c === '/' && n === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end < 0 ? src.length : end + 2;
    } else if (c === "'" || c === '"') {
      let j = i + 1;
      let text = '';
      while (j < src.length && src[j] !== c && src[j] !== '\n') {
        if (src[j] === '\\') { text += src[j] + (src[j + 1] ?? ''); j += 2; } else { text += src[j]; j++; }
      }
      out += c + (WORD.test(text) ? text : '') + c;
      i = j + 1;
    } else if (c === '`') {
      let j = i + 1;
      while (j < src.length && src[j] !== '`') j += src[j] === '\\' ? 2 : 1;
      out += '``';
      i = j + 1;
    } else if (c === '/') {
      const prev = prevSignificant();
      const last = prev[prev.length - 1];
      if (last === undefined || REGEX_PREV.has(last) || REGEX_KEYWORDS.test(prev)) {
        let j = i + 1;
        let inClass = false;
        while (j < src.length && src[j] !== '\n') {
          if (src[j] === '\\') { j += 2; continue; }
          if (src[j] === '[') inClass = true;
          else if (src[j] === ']') inClass = false;
          else if (src[j] === '/' && !inClass) break;
          j++;
        }
        j++;
        let flags = '';
        while (j < src.length && /[a-z]/i.test(src[j])) flags += src[j++];
        out += '/r/' + flags;
        i = j;
      } else {
        out += c;
        i++;
      }
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

// The bodies of a page's inline <script> elements (no src), HTML comments removed first.
export function inlineScripts(html) {
  const live = html.replace(/<!--[\s\S]*?-->/g, '');
  return [...live.matchAll(/<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script\s*>/gi)].map((m) => m[1]);
}
