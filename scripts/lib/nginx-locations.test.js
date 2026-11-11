import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLocations, selectLocation } from './nginx-locations.mjs';

const loc = (modifier, pattern, action = 'serve', auth = false) => ({ modifier, pattern, action, auth });

describe('parseLocations', () => {
  it('reads modifier, pattern, action and auth, skipping named and internal locations', () => {
    const conf = `
      server {
        location = /a { root /x; }
        location @n { return 302 /l; }
        location = /i { internal; proxy_pass http://h; }
        location ~ ^/b\\.html$ { auth_request /i; root /x; }   # a comment { with braces }
        location /api/ { proxy_pass http://h; }
        location / { return 404; }
      }`;
    expect(parseLocations(conf)).toEqual([
      loc('=', '/a', 'serve', false),
      loc('~', '^/b\\.html$', 'serve', true),
      loc('', '/api/', 'proxy', false),
      loc('', '/', '404', false),
    ]);
  });

  it('throws on a pattern with a brace quantifier', () => {
    expect(() => parseLocations('location ~ ^/a{2}$ { root /x; }')).toThrow();
  });

  it('throws on a nested location block', () => {
    expect(() => parseLocations('location /a/ { location /a/b/ { root /x; } }')).toThrow();
  });

  it('parses the real nginx.conf', () => {
    const path = resolve(dirname(fileURLToPath(import.meta.url)), '../../nginx.conf');
    const locations = parseLocations(readFileSync(path, 'utf8'));
    expect(locations.some((l) => l.modifier === '' && l.pattern === '/')).toBe(true);
  });
});

describe('selectLocation', () => {
  it('an exact match beats a matching regex', () => {
    const ls = [loc('~', '^/.*$', '404'), loc('=', '/')];
    expect(selectLocation(ls, '/')).toBe(ls[1]);
  });

  it('a ^~ prefix beats a matching regex', () => {
    const ls = [loc('~', '\\.css$', '404'), loc('^~', '/s/')];
    expect(selectLocation(ls, '/s/a.css')).toBe(ls[1]);
  });

  it('a plain prefix loses to a matching regex', () => {
    const ls = [loc('', '/s/', '404'), loc('~', '\\.css$')];
    expect(selectLocation(ls, '/s/a.css')).toBe(ls[1]);
  });

  it('the first matching regex in file order wins', () => {
    const ls = [loc('~', '^/a', '404'), loc('~', '^/a/b')];
    expect(selectLocation(ls, '/a/b')).toBe(ls[0]);
  });

  it('without a regex, the longest prefix wins', () => {
    const ls = [loc('', '/', '404'), loc('', '/api/', 'proxy')];
    expect(selectLocation(ls, '/api/x')).toBe(ls[1]);
  });

  it('~* ignores case, ~ does not', () => {
    const ls = [loc('~', '\\.CSS$', '404'), loc('~*', '\\.JS$')];
    expect(selectLocation(ls, '/a.css')).toBe(null);
    expect(selectLocation(ls, '/a.js')).toBe(ls[1]);
  });

  it('returns null when nothing matches', () => {
    expect(selectLocation([], '/x')).toBe(null);
  });
});
