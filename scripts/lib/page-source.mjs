// A root page as the tests read it: every js/pages/*.js script tag replaced by the inline block it
// was moved from (same type, the file's content), so assertions on page script code keep working.
import { resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const PAGE_SCRIPT = /<script( type="module")? src="(js\/pages\/[\w.-]+\.js)\?v=\d+"><\/script>/g;

export function pageSource(html, readFile) {
  return html.replace(PAGE_SCRIPT, (_, type = '', path) => `<script${type}>${readFile(path)}</script>`);
}

// True when `path` (absolute, or relative to `root`) is `<root>/<name>.html`.
export function isRootPage(path, root) {
  const p = path instanceof URL ? fileURLToPath(path) : path;
  if (typeof p !== 'string') return false;
  const rel = relative(root, resolve(root, p));
  return rel.endsWith('.html') && !rel.includes(sep) && !rel.includes('/') && !rel.startsWith('..');
}
