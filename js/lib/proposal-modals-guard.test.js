import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..', '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

const pipeline = read('pipeline.html');
const costgrid = read('costgrid.html');

const REMOVED_IDS = [
  'cgNewGridModal', 'cgCloneModal', 'cgNewGridName', 'cgCloneGridName', 'btnCgCreateGrid', 'btnCgClone',
  'cgNewVersionModal', 'cgNewVersionLabel', 'cgNewVersionError', 'openNewVersionModal',
  'cloneGridName', 'cloneError', 'cloneSourceName',
];

describe('New Proposal / Clone modals removed', () => {
  it('pipeline.html contains none of the removed modal ids', () => {
    REMOVED_IDS.forEach(id => expect(pipeline, id).not.toContain(id));
  });

  it('costgrid.html contains none of the removed modal ids', () => {
    REMOVED_IDS.forEach(id => expect(costgrid, id).not.toContain(id));
  });

  it('pipeline.html and costgrid.html reference the same js/costgrid.js and costgrid-calc.js versions', () => {
    const costgridJsVersion = (html) => html.match(/js\/costgrid\.js\?v=(\d+)/)?.[1];
    const costgridCalcVersion = (html) => html.match(/js\/lib\/costgrid-calc\.js\?v=(\d+)/)?.[1];

    expect(costgridJsVersion(pipeline)).toBe('52');
    expect(costgridJsVersion(costgrid)).toBe('52');
    expect(costgridCalcVersion(pipeline)).toBe('12');
    expect(costgridCalcVersion(costgrid)).toBe('12');
  });
});

describe('shared script versions', () => {
  it('every page loads the same js/api-sync.js version', () => {
    ['pipeline.html', 'costgrid.html', 'portfolio.html', 'program.html', 'planning.html', 'project-config.html'].forEach(f => {
      expect(read(f).match(/js\/api-sync\.js\?v=(\d+)/)?.[1], f).toBe('30');
    });
  });
});

describe('version label inline edit is gated', () => {
  it('costgrid.html gates the version-label edit control on isReadOnly (isLocked or viewer)', () => {
    expect(costgrid).toMatch(/editingVersionLabel[\s\S]{0,400}(isReadOnly|isLocked|myPermission\s*===\s*'viewer')/);
  });
});

describe('grid safety rules', () => {
  it('deletePhase checks task assignment before confirming', () => {
    const fn = costgrid.match(/deletePhase\(phase\)\s*\{([\s\S]*?)\n\s*\},/)?.[1] || '';
    expect(fn).toMatch(/isTaskAssigned/);
  });

  it('removeColumnConfirm is reset when a different role menu opens', () => {
    expect(costgrid).toMatch(/openRoleMenu\(code\)\s*\{[\s\S]{0,200}removeColumnConfirm\s*=\s*null/);
  });
});
