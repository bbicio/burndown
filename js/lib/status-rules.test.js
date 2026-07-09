import { describe, it, expect } from 'vitest';
import { getStatusRule } from './status-rules.js';

describe('getStatusRule', () => {
  it('returns empty, disabled options for SIP', () => {
    expect(getStatusRule('SIP')).toEqual({ options: [], disabled: true });
  });

  it('returns null options (keep current), disabled for Canceled', () => {
    expect(getStatusRule('Canceled')).toEqual({ options: null, disabled: true });
  });

  it('includes Started At Risk and Completed (not Complete) for Committed', () => {
    const rule = getStatusRule('Committed');
    expect(rule.disabled).toBe(false);
    expect(rule.options).toContain('Started At Risk');
    expect(rule.options).toContain('Completed');
    expect(rule.options).not.toContain('Complete');
  });

  it('Expected and Anticipated return the same status set', () => {
    expect(getStatusRule('Expected').options).toEqual(getStatusRule('Anticipated').options);
  });

  it('falls back to the full status list for an empty or unrecognized pipeline', () => {
    const full = ['Not started yet', 'Started At Risk', 'Started', 'Put on hold', 'Completed'];
    expect(getStatusRule('').options).toEqual(full);
    expect(getStatusRule('').disabled).toBe(false);
    expect(getStatusRule('not-a-real-pipeline').options).toEqual(full);
  });
});
