// vitest setupFiles: every test's readFileSync of a root page returns pageSource(...), the page with
// its js/pages/*.js scripts back inline. Tests that need the HTML as it is on disk use rawReadFileSync.
import { vi } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pageSource, isRootPage } from './page-source.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const realFs = await vi.importActual('node:fs');

export const rawReadFileSync = realFs.readFileSync;

function readFileSync(path, options) {
  const out = rawReadFileSync(path, options);
  if (!isRootPage(path, ROOT)) return out;
  const text = pageSource(String(out), p => rawReadFileSync(join(ROOT, p), 'utf8'));
  return typeof out === 'string' ? text : Buffer.from(text, 'utf8');
}

vi.mock('node:fs', async () => {
  const actual = await vi.importActual('node:fs');
  const { readFileSync } = await import('./page-source.setup.mjs');
  return { ...actual, readFileSync, default: { ...actual, readFileSync } };
});

export { readFileSync };
