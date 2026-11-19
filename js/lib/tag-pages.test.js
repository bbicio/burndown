import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// project-config.html is read with its js/pages/ script inline (scripts/lib/page-source.setup.mjs).
const pc = readFileSync(join(process.cwd(), 'project-config.html'), 'utf8');

describe('project-config tags', () => {
  it('hides the summary pills while the tags are unknown', () => {
    expect(pc).toMatch(/<template v-if="tagsState !== 'unknown'"><span v-for="g in tagsSummaryGroups"/);
  });
  it('writes one item through tagToggle', () => {
    expect(pc).toContain('window.tagToggle(');
    expect(pc).not.toContain('Api.projects.tags.replace');
    expect(pc).not.toContain('projectTags = []');
    expect(pc).toContain('js/lib/tag-toggle.js?v=1');
  });
  it('disables every tag checkbox until the tags are loaded', () => {
    const inputs = pc.match(/<input type="checkbox"[^>]*@change="toggleTag[^>]*>/g) || [];
    expect(inputs.length).toBeGreaterThan(0);
    for (const i of inputs) expect(i).toContain("tagsState !== 'ok'");
  });
  it('shows the load failure, Retry and the closed-summary state', () => {
    expect(pc).toContain('Tags could not be loaded.');
    expect(pc).toContain('Unavailable');
    const retry = pc.match(/<button[^>]*@click="loadTags"[^>]*>/);
    expect(retry).not.toBeNull();
    expect(retry[0]).toContain('tagSaving');
  });
});

// costgrid.html is read with its js/pages/ script inline.
const cg = readFileSync(join(process.cwd(), 'costgrid.html'), 'utf8');

describe('costgrid tags', () => {
  it('hides the summary pills while the tags are unknown', () => {
    expect(cg).toMatch(/<template v-if="tagsState !== 'unknown'"><span v-for="g in tagsSummaryGroups"/);
  });
  it('writes one item through tagToggle', () => {
    expect(cg).toContain('window.tagToggle(');
    expect(cg).not.toContain('versions.tags.replace');
    expect(cg).not.toContain('versionTagRows = []');
    expect(cg).toContain('js/lib/tag-toggle.js?v=1');
  });
  it('disables every tag checkbox until the tags are loaded', () => {
    const inputs = cg.match(/<input type="checkbox"[^>]*@change="toggleTag[^>]*>/g) || [];
    expect(inputs.length).toBeGreaterThan(0);
    for (const i of inputs) expect(i).toContain("tagsState !== 'ok'");
  });
  it('shows the load failure, Retry and the closed-summary state', () => {
    expect(cg).toContain('Tags could not be loaded.');
    expect(cg).toContain('Unavailable');
    const retry = cg.match(/<button[^>]*@click="loadVersionTags\([^>]*>/);
    expect(retry).not.toBeNull();
    expect(retry[0]).toContain('tagSaving');
  });
  it('adopts a result only for the version it was requested for', () => {
    const src = cg.slice(cg.indexOf('async toggleTag('));
    const body = src.slice(0, src.indexOf('inactiveAssignedForList('));
    expect(body).toContain('const savingForVerId = this.verId');
    expect(body.indexOf('this.verId === savingForVerId')).toBeGreaterThan(body.indexOf('window.tagToggle('));
    const load = cg.slice(cg.indexOf('async loadVersionTags('));
    expect(load.slice(0, 900)).toContain('this.verId === verId');
  });
});
