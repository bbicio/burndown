// Lexical scans for scripts/save-contract-guard.test.js: where a write happens in a source file.
// Pure functions over a string; the guard decides which files and which lists.
//
// Not a parser -- named limits: a `/` after `)` (or a postfix `++`/`--`) is read as division, so
// `if (x) /re/.test(s)` is mis-tokenised; HTML-in-JS and JSX are not handled. SQL is recognised only
// as upper-case keywords inside a string or template literal.

const REGEX_PREV = new Set([...'(,=:[!&|?{};+-*%<>~^']);
const REGEX_KEYWORDS = /(?:^|[^\w$])(?:return|typeof|case|do|else|in|of|void|yield|await|delete|new|throw)$/;

// One kind per character of `src`: 'c' code, 's' string or template text, 'm' comment or regex literal.
export function charKinds(src) {
  const kinds = new Array(src.length).fill('c');
  const mark = (from, to, k) => { for (let x = from; x < to && x < src.length; x++) kinds[x] = k; };
  const braces = [];   // per open `${`: the brace depth inside it, so its closing `}` resumes the template
  let i = 0;
  let lastCode = -1;   // index of the last significant code character
  const prevCode = () => {
    let k = lastCode;
    return k < 0 ? '' : src.slice(Math.max(0, k - 11), k + 1);
  };

  const template = start => {   // from just after a backtick (or the `}` closing a `${`) to its end
    let j = start;
    while (j < src.length) {
      if (src[j] === '\\') { j += 2; continue; }
      if (src[j] === '`') { mark(start, j + 1, 's'); return { end: j + 1, open: false }; }
      if (src[j] === '$' && src[j + 1] === '{') { mark(start, j + 2, 's'); return { end: j + 2, open: true }; }
      j++;
    }
    mark(start, src.length, 's');
    return { end: src.length, open: false };
  };

  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === '/' && n === '/') {
      const end = src.indexOf('\n', i);
      const stop = end < 0 ? src.length : end;
      mark(i, stop, 'm'); i = stop;
    } else if (c === '/' && n === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end < 0 ? src.length : end + 2;
      mark(i, stop, 'm'); i = stop;
    } else if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < src.length && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1;
      mark(i, j + 1, 's'); lastCode = j; i = j + 1;
    } else if (c === '`') {
      kinds[i] = 's';
      const t = template(i + 1);
      if (t.open) braces.push(0); else lastCode = t.end - 1;
      i = t.end;
    } else if (c === '/' && (lastCode < 0 || REGEX_PREV.has(src[lastCode]) || REGEX_KEYWORDS.test(prevCode()))) {
      let j = i + 1, inClass = false;
      while (j < src.length && src[j] !== '\n') {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === '[') inClass = true;
        else if (src[j] === ']') inClass = false;
        else if (src[j] === '/' && !inClass) break;
        j++;
      }
      while (j + 1 < src.length && /[a-z]/i.test(src[j + 1])) j++;
      mark(i, j + 1, 'm'); i = j + 1; lastCode = j;
    } else if (braces.length && c === '{') {
      braces[braces.length - 1]++; lastCode = i; i++;
    } else if (braces.length && c === '}') {
      if (braces[braces.length - 1] === 0) {
        braces.pop();
        kinds[i] = 's';
        const t = template(i + 1);
        if (t.open) braces.push(0); else lastCode = t.end - 1;
        i = t.end;
      } else { braces[braces.length - 1]--; lastCode = i; i++; }
    } else {
      if (!/\s/.test(c)) lastCode = i;
      i++;
    }
  }
  return kinds;
}

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// [[start, end]] of every call `callee(...)` in code, `end` just past its closing parenthesis. A
// parenthesis inside a string, a template's text or a comment does not count.
export function callSpans(source, callee, kinds = charKinds(source)) {
  const spans = [];
  const re = new RegExp('(?<![\\w$])' + escapeRe(callee) + '\\s*\\(', 'g');
  let m;
  while ((m = re.exec(source))) {
    if (kinds[m.index] !== 'c') continue;
    let depth = 0, j = m.index + m[0].length - 1;
    for (; j < source.length; j++) {
      if (kinds[j] !== 'c') continue;
      if (source[j] === '(') depth++;
      else if (source[j] === ')' && --depth === 0) break;
    }
    spans.push([m.index, j + 1]);
  }
  return spans;
}

// [{ table, index, inside }] for each INSERT INTO / UPDATE / DELETE FROM on one of `tables` written
// in a string or template literal; `inside` is true within the arguments of a versionedWrite( call.
export function serverWrites(source, tables) {
  const kinds = charKinds(source);
  const spans = callSpans(source, 'versionedWrite', kinds);
  const wanted = new Set(tables);
  const out = [];
  const re = /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(\w+)\b/g;
  let m;
  while ((m = re.exec(source))) {
    if (kinds[m.index] !== 's' || !wanted.has(m[1])) continue;
    out.push({ table: m[1], index: m.index, inside: spans.some(([a, b]) => m.index > a && m.index < b) });
  }
  return out;
}

const WRITE_METHOD = /\bmethod\s*:\s*['"](POST|PUT|PATCH|DELETE)['"]/;

// Set of dotted paths ('ns.name', 'ns.sub.name') for every method of js/api.js's Api object that
// sends a write method. Reads the layout js/api.js uses: inside `const Api = {`, a namespace opens as
// `<indent>key: {` alone on its line and closes as `<indent>},`; a method is `<indent + 2>key:`.
export function apiWriteMethods(apiJsSource) {
  const out = new Set();
  const stack = [];   // [{ key, indent }] of the open namespaces
  let inApi = false, name = null, text = '';
  const flush = () => { if (name && WRITE_METHOD.test(text)) out.add(name); name = null; text = ''; };
  for (const line of apiJsSource.split(/\r?\n/)) {
    if (!inApi) { inApi = /^const Api\s*=\s*\{/.test(line); continue; }
    if (/^\};?\s*$/.test(line)) { flush(); break; }
    const open = line.match(/^( +)(\w+)\s*:\s*\{\s*$/);
    const close = line.match(/^( +)\},?\s*$/);
    const method = line.match(/^( +)(\w+)\s*:/);
    if (open) { flush(); stack.push({ key: open[2], indent: open[1].length }); continue; }
    if (close && stack.length && close[1].length === stack[stack.length - 1].indent) { flush(); stack.pop(); continue; }
    if (method && stack.length && method[1].length === stack[stack.length - 1].indent + 2) {
      flush();
      name = [...stack.map(s => s.key), method[2]].join('.');
    }
    if (name) text += line + '\n';
  }
  flush();
  return out;
}

// Every use of the Api object in code: { path, call, index }. `call` is true for Api.<path>( and
// false for a reference such as a namespace passed whole (`moveClient(..., Api.clientGroups)`).
export function apiUses(source, kinds = charKinds(source)) {
  const out = [];
  const re = /(?<![\w$.])Api((?:\.\w+)+)(\s*\()?/g;
  let m;
  while ((m = re.exec(source))) {
    if (kinds[m.index] === 'c') out.push({ path: m[1].slice(1), call: !!m[2], index: m.index });
  }
  return out;
}

// The write methods a use reaches: the method it calls, or every write method under a namespace it
// hands over whole.
export function reachedMethods(use, writeMethods) {
  if (use.call) return writeMethods.has(use.path) ? [use.path] : [];
  return [...writeMethods].filter(m => m === use.path || m.startsWith(use.path + '.'));
}

// [{ kind, name, index }] for each write a client file sends: a call to a write method of Api.*, a
// namespace holding write methods handed over whole, or an apiFetch( / fetch( call whose arguments
// carry a write method. A fetch with the method in a variable is not seen.
export function clientWrites(source, writeMethods) {
  const kinds = charKinds(source);
  const out = [];
  for (const use of apiUses(source, kinds)) {
    if (reachedMethods(use, writeMethods).length) out.push({ kind: 'api', name: use.path, index: use.index });
  }
  for (const callee of ['apiFetch', 'fetch']) {
    for (const [a, b] of callSpans(source, callee, kinds)) {
      const w = source.slice(a, b).match(WRITE_METHOD);
      if (w) out.push({ kind: callee, name: w[1], index: a });
    }
  }
  return out.sort((x, y) => x.index - y.index);
}
