import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import * as web from './notification-url.js';

const server = createRequire(import.meta.url)('../../api/src/lib/notification-url.js');

const VALUES = [
  '/pipeline.html', '/costgrid.html?cgId=1&verId=2#x', 'http://localhost/pipeline.html',
  'http://localhost:80/x', 'http://evil.com@localhost/x', '/%5Cevil', '/%2F%2Fevil',
  'https://app.example.com/x', 'https://app.example.com.evil.com/x',
  'javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,x', '//example.com', '/\\evil',
  '\\\\host\\x', 'https://example.com/x', 'http://localhost.evil.com/x', 'http://localhost@evil.com/x',
  'https://localhost/x', '/a\nb', '/a\u0000b', '/a b', '   ', 'pipeline.html', '/' + 'a'.repeat(2048),
  123, {}, ['/a'], null, undefined, ''
];

describe('notificationUrl: browser and server twins agree', () => {
  for (const origin of ['http://localhost', 'https://app.example.com']) {
    it(`gives identical results for every case at ${origin}`, () => {
      for (const v of VALUES) {
        expect(web.notificationUrl(v, origin), JSON.stringify(v)).toBe(server.notificationUrl(v, origin));
      }
    });
  }
});
