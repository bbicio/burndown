// Pure core of the site export: parse the path rules, classify tracked paths
// as site or process, and plan a copy. No git, no filesystem — the CLI
// (scripts/site-export.mjs) does that. The list is scripts/site-export.rules;
// see docs/superpowers/specs/2026-11-12-site-export-classification-design.md.
//
// Rule file: one `include <glob>` or `exclude <glob>` per line, `#` comments.
// First matching rule wins; there is no catch-all, so a path no rule covers is
// `unclassified`. Globs are anchored on the whole path: `**/` is zero or more
// directories, `**` anything, `*` anything but `/`, `?` one char but `/`, a
// trailing `/` is that directory and everything below it.

const ACTIONS = new Set(['include', 'exclude']);

function globToRegExp(pattern) {
  let p = pattern.endsWith('/') ? `${pattern}**` : pattern;
  let out = '';
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === '*' && p[i + 1] === '*') {
      if (p[i + 2] === '/') { out += '(?:.*/)?'; i += 2; } else { out += '.*'; i += 1; }
    } else if (c === '*') out += '[^/]*';
    else if (c === '?') out += '[^/]';
    else out += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${out}$`);
}

/**
 * @param {string} text
 * @returns {{ action: 'include'|'exclude', pattern: string, line: number, re: RegExp }[]}
 */
export function parseRules(text) {
  const rules = [];
  String(text).split(/\r?\n/).forEach((raw, idx) => {
    const line = idx + 1;
    const s = raw.trim();
    if (s === '' || s.startsWith('#')) return;
    const m = /^(\S+)\s+(\S+)(.*)$/.exec(s);
    if (!m) throw new Error(`site-export.rules:${line}: expected "<include|exclude> <glob>"`);
    if (!ACTIONS.has(m[1])) throw new Error(`site-export.rules:${line}: unknown directive "${m[1]}"`);
    if (m[3].trim() !== '') {
      throw new Error(`site-export.rules:${line}: unexpected text after the glob (a comment goes on its own line; use ? for a space in a path)`);
    }
    rules.push({ action: m[1], pattern: m[2], line, re: globToRegExp(m[2]) });
  });
  return rules;
}

/** First matching rule wins; no match → `unclassified`. Same order as `paths`. */
export function classify(paths, rules) {
  return paths.map((path) => {
    const rule = rules.find((r) => r.re.test(path)) ?? null;
    return { path, verdict: rule ? rule.action : 'unclassified', rule };
  });
}

export function describeRule(rule) {
  return rule ? `${rule.action} ${rule.pattern} (line ${rule.line})` : 'no rule';
}

const isBinary = (buf) => buf.includes(0);
const toLf = (buf) => Buffer.from(buf.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');

function sameContent(a, b) {
  if (a.equals(b)) return true;
  if (isBinary(a) || isBinary(b)) return false;
  return toLf(a).equals(toLf(b));
}

/**
 * @param {Map<string, Buffer>} wanted   path → content of the commit
 * @param {Map<string, Buffer>} existing path → content in the destination
 * A text file that differs only by CRLF vs LF counts as unchanged (the
 * destination clone may check out CRLF); a file with a NUL byte is binary.
 * Known limit, accepted in the plan (decision 4): a commit that only changes a
 * file's line endings is not propagated to a destination holding the old ones.
 */
export function planCopy(wanted, existing) {
  const added = [];
  const modified = [];
  for (const [path, buf] of wanted) {
    const cur = existing.get(path);
    if (!cur) added.push(path);
    else if (!sameContent(buf, cur)) modified.push(path);
  }
  const deleted = [...existing.keys()].filter((p) => !wanted.has(p));
  return { added: added.sort(), modified: modified.sort(), deleted: deleted.sort() };
}
