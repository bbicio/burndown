import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const read = f => readFileSync(join(process.cwd(), f), 'utf8');

// Body of the first rule whose selector is exactly `selector`, or null.
export const rule = (text, selector) => {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp('(?:^|[}\\s])' + esc + '\\s*\\{([^}]*)\\}').exec(text);
  return m ? m[1].trim() : null;
};

// A hex colour, rgb(a)() or a literal px/rem measure.
export const LITERAL = /#[0-9a-fA-F]{3,8}\b|rgba?\(|\b\d*\.?\d+(px|rem)\b/;

describe('rule helper', () => {
  it('matches the exact selector', () => {
    expect(rule('.a{x:1}.ab{y:2}', '.a')).toBe('x:1');
  });
  it('does not match a longer selector', () => {
    expect(rule('.ab{y:2}', '.a')).toBeNull();
  });
});

describe('component tokens', () => {
  const tokens = read('css/tokens.css');
  const EXPECTED = {
    'card-bg': 'var(--surface-white)',
    'card-border': '1px solid var(--border-light)',
    'card-radius': 'var(--radius-lg)',
    'card-shadow': 'none',
    'card-pad': 'var(--space-4)',
    'card-head-pad': 'var(--space-3) var(--space-4)',
    'card-danger-border': '1px solid var(--color-danger)',
    'tile-pad': 'var(--space-3) var(--space-4)',
    'tile-label-size': 'var(--text-2xs)',
    'tile-value-size': '1.375rem',
    'banner-radius': 'var(--radius-sm)',
    'banner-pad': 'var(--space-2) var(--space-3)',
    'banner-font-size': 'var(--text-sm)',
    'content-gap': 'var(--space-4)',
  };
  for (const [name, value] of Object.entries(EXPECTED)) {
    it(`defines --${name}`, () => {
      expect(tokens).toContain(`--${name}: ${value};`);
    });
  }
});

describe('excluded pages are untouched', () => {
  // sha256 of the concatenated inline <style> contents, computed on main before this cycle.
  const MASTER_SHA = '15420c48651b185e8db0cf8c0835e80345b63a666f9a0a0aa90970140965f2de';
  const EXCLUDED_STYLE_SHA = {
    'master-clients.html': MASTER_SHA,
    'master-client-groups.html': MASTER_SHA,
    'master-pipelines.html': MASTER_SHA,
    'master-roles.html': MASTER_SHA,
    'master-currencies.html': MASTER_SHA,
    'project-config.html': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  };
  const styleSha = file => {
    const s = [...read(file).matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
    return createHash('sha256').update(s).digest('hex');
  };
  for (const [file, sha] of Object.entries(EXCLUDED_STYLE_SHA)) {
    it(`${file} keeps its inline styles`, () => {
      expect(styleSha(file)).toBe(sha);
    });
  }
  it('.cfg-section in style.css is unchanged', () => {
    expect(rule(read('css/style.css'), '.cfg-section')).toBe(
      'background: var(--surface-light); border-radius: var(--radius-md); padding: 16px 18px; margin-bottom: 1rem;');
  });
});
