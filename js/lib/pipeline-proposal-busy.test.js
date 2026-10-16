import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// pipeline.html's createNewProposal/cloneProposal are Vue methods inside an inline script, so each
// is cut out of the page and run against stubs. B-003: after a successful create/clone the page is
// navigating, so New/Clone stay disabled until the unload; a failure re-enables them.
const html = readFileSync('pipeline.html', 'utf8');

function extractMethod(src, name) {
  const start = src.indexOf(`async ${name}(`);
  if (start < 0) throw new Error(`method ${name} not found`);
  let i = src.indexOf('{', src.indexOf(')', start));
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) { i++; break; }
  }
  return src.slice(start, i);
}

function ctx() {
  return { proposalBusy: false, refreshTick: 0, collapsedStages: ['Draft', 'SIP'] };
}

const cases = [
  { method: 'cloneProposal', lib: 'cgCloneGrid', args: ['cg1', 'v1'] },
  { method: 'createNewProposal', lib: 'cgCreateNewGrid', args: [] },
];

for (const { method, lib, args } of cases) {
  function run(stub, self) {
    const obj = new Function('cgCloneGrid', 'cgCreateNewGrid',
      `return { ${extractMethod(html, method)} }`)(
      lib === 'cgCloneGrid' ? stub : () => {}, lib === 'cgCreateNewGrid' ? stub : () => {});
    return obj[method].apply(self, args);
  }

  describe(`${method} — proposalBusy`, () => {
    it('keeps proposalBusy after a successful run', async () => {
      const self = ctx();
      await run(async () => true, self);
      expect(self.proposalBusy).toBe(true);
      expect(self.refreshTick).toBe(1);
      expect(self.collapsedStages).toEqual(['SIP']);
    });

    it('releases proposalBusy after a failed run', async () => {
      const self = ctx();
      await run(async () => false, self);
      expect(self.proposalBusy).toBe(false);
      expect(self.refreshTick).toBe(0);
    });

    it('releases proposalBusy when the run throws', async () => {
      const self = ctx();
      await expect(run(async () => { throw new Error('x'); }, self)).rejects.toThrow();
      expect(self.proposalBusy).toBe(false);
    });
  });
}
