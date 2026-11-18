import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { extractBlock } from '../../scripts/lib/extract-source.mjs';

// The program share (save contract cycle 3): the message reports the projects shared and those that kept a higher access.
const js = readFileSync('js/shares.js', 'utf8');
const message = new Function(`${extractBlock(js, 'function _programShareMessage(')}; return _programShareMessage;`)();

describe('program share message', () => {
  it('program share message counts kept', () => {
    expect(message({ shared: 3, kept: 2, emailSent: true })).toBe('Shared 3 projects; 2 kept their higher access.');
  });
  it('says nothing about kept access when none was kept', () => {
    expect(message({ shared: 1, kept: 0, emailSent: true })).toBe('Shared 1 project.');
  });
  it('reports an email that could not be sent', () => {
    expect(message({ shared: 2, kept: 0, emailSent: false })).toBe('Shared 2 projects. The email could not be sent.');
  });
  it('the share goes through apiSave', () => {
    expect(extractBlock(js, 'async function _shareAddUser(')).toContain("window.apiSave('POST', `/programs/");
  });
});
