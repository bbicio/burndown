import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import * as web from './dates.js';

const server = createRequire(import.meta.url)('../../api/src/lib/dates.js');

const VERSION = { kind: 'month', label: 'version' };
const TASK = { kind: 'day', label: 'task "T1"' };

// Every case of js/lib/dates.test.js for the eight functions the two twins share.
const CASES = [
  ['isDay', ['20260431']], ['isDay', ['20260229']], ['isDay', ['20240229']],
  ['isDay', ['2026-04-30']], ['isDay', ['15/03/20']], ['isDay', [null]],
  ['isMonth', ['202613']], ['isMonth', ['202600']], ['isMonth', ['2026-05']],
  ['isMonth', [' 202605']], ['isMonth', ['202605']],
  ['toYmd', ['2026-04-30']], ['toYmd', ['2026-04-31']],
  ['toIso', ['20260430']], ['toIso', ['x']],
  ['monthFirstDay', ['202602']], ['monthLastDay', ['202602']],
  ['monthLastDay', ['202402']], ['monthLastDay', ['202613']],
  ['isOrdered', ['202609', '202607']], ['isOrdered', ['202607', '202607']],
  ['isOrdered', ['', '202607']], ['isOrdered', [null, undefined]],
  ['isOrdered', ['202613', '']], ['isOrdered', ['2026-03-02', '20260301']],
  ['isOrdered', ['2026-03-01', '20260302']],
  ['periodError', ['202609', '202607', VERSION]],
  ['periodError', ['2026-05', '', VERSION]],
  ['periodError', ['2026-04-31', '', TASK]],
  ['periodError', ['', '202613', VERSION]],
  ['periodError', ['202607', '202609', VERSION]],
  ['periodError', ['', '', VERSION]],
  ['periodError', ['2026-07-01', '', { kind: 'day', label: 'task' }]]
];

describe('twins agree', () => {
  it.each(CASES)('%s(%j) is identical in the browser and server modules', (fn, args) => {
    expect(server[fn](...args)).toEqual(web[fn](...args));
  });
  it('the server twin does not export the browser-only text functions', () => {
    ['parseDayText', 'formatDayText', 'parseMonthText', 'formatMonthText', 'parseDateInput', 'isWithin']
      .forEach(n => expect(server[n]).toBeUndefined());
  });
});
