import { describe, it, expect } from 'vitest';
import { externalResources } from './lib/cdn-urls.mjs';

describe('externalResources', () => {
  it('reads a CDN script', () => {
    const v = 'https://unpkg.com/vue@3.5.45/dist/vue.global.prod.js';
    expect(externalResources(`<script defer src="${v}" integrity="sha384-x" crossorigin="anonymous"></script>`))
      .toEqual([{ kind: 'script', url: v }]);
  });
  it('reads a stylesheet', () => {
    const u = 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css';
    expect(externalResources(`<link rel="stylesheet" href="${u}">`)).toEqual([{ kind: 'stylesheet', url: u }]);
  });
  it('reads an icon over several lines with href before rel', () => {
    const u = 'https://ik.imagekit.io/x/letter-f.png';
    expect(externalResources(`<link\n  href="${u}"\n  rel="icon">`)).toEqual([{ kind: 'icon', url: u }]);
  });
  it('classifies any other rel as other', () => {
    expect(externalResources('<link rel="preconnect" href="https://fonts.example">'))
      .toEqual([{ kind: 'other', url: 'https://fonts.example' }]);
  });
  it('ignores local scripts and anchors', () => {
    expect(externalResources('<script src="js/core.js?v=3"></script>\n<a href="https://example.com">x</a>')).toEqual([]);
  });
});
