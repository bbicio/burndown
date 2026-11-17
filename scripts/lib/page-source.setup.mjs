// vitest setupFiles: every test's readFileSync of a root page returns pageSource(...), the page with
// its js/pages/*.js scripts back inline. Tests that need the HTML as it is on disk use rawReadFileSync.
//
// What it covers: readFileSync of `node:fs`, named or default import, in the test process.
// What it does not: fs.promises / `node:fs/promises`, readFile with a callback, createReadStream,
// require('fs') in a CommonJS file, and reads made by a worker or child process; those see the page
// as it is on disk, without its scripts. scripts/page-source.test.js pins the covered forms.
// A structural check on the served page (no <script> body, a tag's position or ?v=) reads it with
// rawReadFileSync, as scripts/security-headers-guard.test.js does.
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
