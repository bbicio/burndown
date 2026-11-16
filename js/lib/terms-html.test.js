// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import createDOMPurify from 'dompurify';
import { safeTermsHtml } from './terms-html.js';

const STARTING = readFileSync('api/src/db/migrations/015_app_settings.sql', 'utf8')
  .match(/'(<h2>[\s\S]*?)'\)/)[1].replace(/''/g, "'")
  .replace(/\r\n/g, '\n');   // a Windows checkout has CRLF; the HTML parser normalises it to LF

describe('safeTermsHtml with DOMPurify', () => {
  beforeEach(() => { window.DOMPurify = createDOMPurify(window); });

  it('strips scripts and handlers', () => {
    for (const html of ['<p>a</p><script>alert(1)</script>', '<img src=x onerror=alert(1)>', '<p onclick="x()">b</p>']) {
      const out = safeTermsHtml(html);
      expect(out).not.toMatch(/script|onerror|onclick|<img/i);
    }
  });

  it('drops unsafe hrefs', () => {
    for (const href of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)', 'data:text/html,x', '//evil.com/x', 'vbscript:x']) {
      const out = safeTermsHtml(`<a href="${href}">x</a>`);
      expect(out, href).not.toMatch(/href=/);
    }
  });

  it('keeps allowed links', () => {
    for (const href of ['https://example.com/x', 'http://example.com', 'mailto:a@b.c', '/pipeline.html']) {
      expect(safeTermsHtml(`<a href="${href}">x</a>`)).toBe(`<a href="${href}">x</a>`);
    }
  });

  it('drops style, class and id', () => {
    expect(safeTermsHtml('<p style="color:red" class="x" id="y">t</p>')).toBe('<p>t</p>');
  });

  it('keeps the starting content', () => {
    expect(safeTermsHtml(STARTING)).toBe(STARTING);
  });
});

describe('safeTermsHtml without DOMPurify', () => {
  beforeEach(() => { delete window.DOMPurify; });

  it('falls back to escaped text', () => {
    expect(safeTermsHtml('<b>x</b> & "y"')).toBe('&lt;b&gt;x&lt;/b&gt; &amp; &quot;y&quot;');
  });

  it('non-string gives an empty string', () => {
    for (const v of [null, undefined, 42, {}]) expect(safeTermsHtml(v)).toBe('');
  });
});
