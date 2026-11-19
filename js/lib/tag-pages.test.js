import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// project-config.html is read with its js/pages/ script inline (scripts/lib/page-source.setup.mjs).
const pc = readFileSync(join(process.cwd(), 'project-config.html'), 'utf8');

describe('project-config tags', () => {
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
