import { describe, it, expect } from 'vitest';
import { notificationUrl } from './notification-url.js';

const ORIGIN = 'http://localhost';

const VALID = [
  '/pipeline.html',
  '/costgrid.html?cgId=1&verId=2#x',
  'http://localhost/pipeline.html',
  'http://localhost:80/x',
  'http://evil.com@localhost/x',
  '/%5Cevil',
  '/%2F%2Fevil'
];

const INVALID = [
  'javascript:alert(1)',
  'JaVaScRiPt:alert(1)',
  'data:text/html,x',
  '//example.com',
  '/\\evil',
  '\\\\host\\x',
  'https://example.com/x',
  'http://localhost.evil.com/x',
  'http://localhost@evil.com/x',
  'https://localhost/x',
  '/a\nb',
  '/a\u0000b',
  '/a b',
  '   ',
  'pipeline.html',
  '/' + 'a'.repeat(2048),
  123,
  {},
  ['/a']
];

describe('notificationUrl', () => {
  for (const v of VALID) {
    it(`accepts ${JSON.stringify(v)}`, () => {
      expect(notificationUrl(v, ORIGIN)).toBe(v);
    });
  }
  for (const v of INVALID) {
    it(`rejects ${JSON.stringify(v)}`, () => {
      expect(notificationUrl(v, ORIGIN)).toBeNull();
    });
  }
  it('answers null for an absent url', () => {
    for (const v of [null, undefined, '']) expect(notificationUrl(v, ORIGIN)).toBeNull();
  });
  it('compares the parsed origin, not a string prefix', () => {
    expect(notificationUrl('https://app.example.com/x', 'https://app.example.com')).toBe('https://app.example.com/x');
    expect(notificationUrl('https://app.example.com.evil.com/x', 'https://app.example.com')).toBeNull();
  });
  it('refuses every absolute url when the origin is opaque ("null") and still takes paths', () => {
    expect(notificationUrl('http://localhost/x', 'null')).toBeNull();
    expect(notificationUrl('/x', 'null')).toBe('/x');
  });
  it('is bridged on window', () => {
    expect(window.notificationUrl).toBe(notificationUrl);
  });
});
