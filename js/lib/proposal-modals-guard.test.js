import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..', '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

const pipeline = read('pipeline.html');
const costgrid = read('costgrid.html');

const REMOVED_IDS = ['cgNewGridModal', 'cgCloneModal', 'cgNewGridName', 'cgCloneGridName', 'btnCgCreateGrid', 'btnCgClone'];

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

    expect(costgridJsVersion(pipeline)).toBe('39');
    expect(costgridJsVersion(costgrid)).toBe('39');
    expect(costgridCalcVersion(pipeline)).toBe('6');
    expect(costgridCalcVersion(costgrid)).toBe('6');
  });
});
