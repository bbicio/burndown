// JavaScript source reduced to its code, for guards that look for statements with a regex.
// Comments are dropped; string literals keep their text only when it is a short word (`'anonymous'`,
// `"crossorigin"`), so a statement quoted in a string or a help text never reads as code; template
// literals and regex literals are blanked (`` ` ` ``, `/r/`).
//
// Not a parser -- named limits: a `/` after `)` (or after a postfix `++`/`--`) is read as division,
// so `if (x) /re/.test(s)` is mis-tokenised; a regex or string with no end on its line ends there; a template literal ends at its first unescaped backtick, so a template nested in
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
  // The last few characters of the output before trailing whitespace: enough to read a keyword.
  const prevSignificant = () => {
    let k = out.length - 1;
    while (k >= 0 && /\s/.test(out[k])) k--;
    return out.slice(Math.max(0, k - 11), k + 1);
  };
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
      i = src[j] === c ? j + 1 : j; // unterminated: the newline stays

    } else if (c === '`') {
      let j = i + 1;
      while (j < src.length && src[j] !== '`') j += src[j] === '\\' ? 2 : 1;
      out += '``';
      i = j + 1;
    } else if (c === '/') {
      const prev = prevSignificant();
      const last = prev[prev.length - 1];
      const postfix = /(\+\+|--)$/.test(prev); // i++ / 2 is a division
      let end = -1;
      if (!postfix && (last === undefined || REGEX_PREV.has(last) || REGEX_KEYWORDS.test(prev))) {
        let j = i + 1;
        let inClass = false;
        while (j < src.length && src[j] !== '\n') {
          if (src[j] === '\\') { j += 2; continue; }
          if (src[j] === '[') inClass = true;
          else if (src[j] === ']') inClass = false;
          else if (src[j] === '/' && !inClass) { end = j; break; }
          j++;
        }
      }
      if (end < 0) { // division, or a regex with no end on its line: never swallow the newline
        out += c;
        i++;
      } else {
        let j = end + 1;
        let flags = '';
        while (j < src.length && /[a-z]/i.test(src[j])) flags += src[j++];
        out += '/r/' + flags;
        i = j;
      }
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

const JS_TYPE = /^(?:|module|text\/javascript|application\/javascript|text\/ecmascript|application\/ecmascript)$/i;

// The bodies of a page's inline JavaScript <script> elements (no src; no type, module or a JavaScript
// MIME type). One pass in document order, so a comment hides the scripts inside it and a `<!--` inside
// a script body is just text.
export function inlineScripts(html) {
  const out = [];
  for (const m of html.matchAll(/<!--[\s\S]*?-->|<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (m[2] === undefined) continue; // a comment
    const attrs = m[1];
    if (/(?<![\w-])src\s*=/i.test(attrs)) continue;
    const type = /(?<![\w-])type\s*=\s*["']?([^"'\s>]*)/i.exec(attrs)?.[1] ?? '';
    if (JS_TYPE.test(type)) out.push(m[2]);
  }
  return out;
}

// The inline event-handler attributes (`on<name>=`, lower case) of a page's tags, in document
// order, separated from what precedes them by space or `/` as a browser reads them. Comments and
// the bodies of <script> elements are skipped; a quoted attribute value is
// read as one piece, so `title="a onclick=b"` is not a handler. Vue's `@click`/`v-on:` are not.
export function handlerAttributes(html) {
  const out = [];
  const TAG = /<!--[\s\S]*?-->|<script\b(?:"[^"]*"|'[^']*'|[^'">])*>[\s\S]*?<\/script\s*>|<[a-zA-Z](?:"[^"]*"|'[^']*'|[^'">])*>/gi;
  for (const [tag] of html.matchAll(TAG)) {
    if (tag.startsWith('<!--')) continue;
    const open = /^<[^\s/>]*((?:"[^"]*"|'[^']*'|[^'">])*)>/.exec(tag)[1];
    for (const m of open.matchAll(/"[^"]*"|'[^']*'|(?<=[\s/])(on[a-z]+)\s*=/gi)) {
      if (m[1]) out.push(m[1].toLowerCase());
    }
  }
  return out;
}
