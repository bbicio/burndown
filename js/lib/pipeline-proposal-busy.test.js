import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { extractBlock } from '../../scripts/lib/extract-source.mjs';

// pipeline.html's createNewProposal/cloneProposal are Vue methods inside an inline script, so each
// is cut out of the page and run against stubs. B-003: after a successful create/clone the page is
// navigating, so New/Clone stay disabled until the unload; a failure re-enables them.
const html = readFileSync('pipeline.html', 'utf8');

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
      `return { ${extractBlock(html, `async ${method}(`)} }`)(
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

// Back from the editor via the back/forward cache: the page is restored with proposalBusy still true.
describe('pageshow — proposalBusy', () => {
  function handler() {
    const created = html.slice(html.indexOf('async created() {'));
    const m = created.match(/window\.addEventListener\('pageshow', (e => \{[^}]*\})\);/);
    if (!m) throw new Error('pageshow listener not found in created()');
    return m[1];
  }

  it('releases proposalBusy on a page restored from the bfcache', () => {
    const self = { proposalBusy: true };
    new Function(`return ${handler()}`).call(self)({ persisted: true });
    expect(self.proposalBusy).toBe(false);
  });

  it('leaves proposalBusy alone on an ordinary load', () => {
    const self = { proposalBusy: true };
    new Function(`return ${handler()}`).call(self)({ persisted: false });
    expect(self.proposalBusy).toBe(true);
  });
});
