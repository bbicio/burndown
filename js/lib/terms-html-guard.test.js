// Pins how the two pages that show the Terms HTML load the sanitiser and use it (U-01).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const PURIFY_TAG = '<script defer src="https://cdn.jsdelivr.net/npm/dompurify@3.4.18/dist/purify.min.js" '
  + 'integrity="sha384-lkArbWjiZKuE+bzKbj1vOEF7DKYBDNvgwZMCt5OH8bdRB92zpzyNska9Q/XKPHQD" crossorigin="anonymous"></script>';
const MODULE_TAG = '<script type="module" src="js/lib/terms-html.js?v=1"></script>';

describe.each(['terms.html', 'privacy-notice.html'])('%s', (page) => {
  const html = readFileSync(page, 'utf8');
  const appScript = html.lastIndexOf('<script type="module">');

  it('loads DOMPurify with SRI and the terms-html module before the app script', () => {
    expect(html.indexOf(PURIFY_TAG)).toBeGreaterThan(-1);
    expect(html.indexOf(MODULE_TAG)).toBeGreaterThan(-1);
    expect(html.indexOf(PURIFY_TAG)).toBeLessThan(appScript);
    expect(html.indexOf(MODULE_TAG)).toBeLessThan(appScript);
  });

  it('renders the Terms only through safeContent', () => {
    const bindings = [...html.matchAll(/v-html="([^"]*)"/g)].map((m) => m[1]);
    expect(bindings).toEqual(['safeContent']);
    expect(html).toMatch(/safeContent\(\)\s*\{\s*return window\.safeTermsHtml\(this\.\w+\)/);
  });
});
