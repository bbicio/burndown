import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { extractBlock } from '../../scripts/lib/extract-source.mjs';

const core = fs.readFileSync(path.resolve(__dirname, '../core.js'), 'utf8');

const headerBadge = new Function(`${extractBlock(core, 'function esc(')}\n${extractBlock(core, 'function headerBadge(')}\nreturn headerBadge;`)();

describe('headerBadge', () => {
  it('renders a stage badge from the pipeline tokens', () => {
    const h = headerBadge('stage', 'Committed');
    expect(h).toContain('class="ph-badge"');
    expect(h).toContain('var(--pipeline-committed-bg)');
    expect(h).toContain('var(--pipeline-committed-color)');
    expect(h).toContain('>Committed<');
  });
  it('renders a status badge from the soft status tokens', () => {
    const h = headerBadge('status', 'Started At Risk');
    expect(h).toContain('class="ph-badge"');
    expect(h).toContain('var(--status-at-risk-soft-bg)');
    expect(h).toContain('var(--status-at-risk-soft-text)');
    expect(h).toContain('>Started At Risk<');
  });
  it('maps every status and stage', () => {
    for (const [v, s] of [['Not started yet', 'not-started'], ['Started', 'started'], ['Put on hold', 'on-hold'], ['Completed', 'completed']])
      expect(headerBadge('status', v)).toContain(`var(--status-${s}-soft-bg)`);
    for (const v of ['SIP', 'Expected', 'Anticipated', 'Canceled'])
      expect(headerBadge('stage', v)).toContain(`var(--pipeline-${v.toLowerCase()}-bg)`);
  });
  it('returns an empty string for unknown, empty or Draft values', () => {
    expect(headerBadge('stage', '')).toBe('');
    expect(headerBadge('stage', undefined)).toBe('');
    expect(headerBadge('stage', 'Draft')).toBe('');
    expect(headerBadge('status', 'Unknown')).toBe('');
    expect(headerBadge('other', 'Started')).toBe('');
    expect(headerBadge('stage', '<b>')).toBe('');
    expect(headerBadge('status', 'constructor')).toBe('');
  });
});
