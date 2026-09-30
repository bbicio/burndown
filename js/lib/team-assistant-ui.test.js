import { describe, it, expect } from 'vitest';
import { renderChatText, rowView, projectOptions, starterPrompts, tableTitle, isStaleResponse, chatPayload } from './team-assistant-ui.js';

describe('renderChatText', () => {
  it('escapes HTML from the model before applying bold and line breaks', () => {
    expect(renderChatText('**Best** <img src=x onerror=alert(1)>\nnext & done'))
      .toBe('<strong>Best</strong> &lt;img src=x onerror=alert(1)&gt;<br>next &amp; done');
  });
  it('handles empty/nullish text', () => {
    expect(renderChatText('')).toBe('');
    expect(renderChatText(null)).toBe('');
  });
});

describe('rowView', () => {
  const row = {
    name: 'Mario Rossi', roleCode: 'DEV', score: 81.26, roleHours: 142.4,
    tags: [{ list: 'Market', value: 'Italy', hours: 90.4 }], projects: [{ name: 'Brand X', hours: 90 }],
    tasks: [{ name: 'Data analysis', project: 'Brand X', hours: 60 }],
    topics: [{ name: 'Data viz', kind: 'direct', hours: 60 }, { name: 'Copy', kind: 'context', hours: 0 }],
    freeAvg: 12.4, freeMin: 0, currentLoad: 30.2, hoursOnProject: 8, flags: ['no relevant experience'], rationale: 'r',
  };
  it('formats numbers and lists for display', () => {
    const v = rowView(row);
    expect(v.score).toBe('81.3');
    expect(v.roleHours).toBe('142');
    expect(v.tags).toBe('Italy (90 h)');
    expect(v.projects).toBe('Brand X (90 h)');
    expect(v.tasks).toBe('Data analysis (60 h)');
    expect(v.topics).toBe('Data viz (direct), Copy (context)');
    expect(v.free).toBe('12 avg / 0 min');
    expect(v.load).toBe('30');
    expect(v.onProject).toBe('8');
    expect(v.flags).toBe('no relevant experience');
  });
  it('shows an em dash when availability is not computable and for empty lists', () => {
    const v = rowView({ ...row, freeAvg: null, freeMin: null, tags: [], projects: [], tasks: [], topics: [], flags: [] });
    expect(v.free).toBe('—');
    expect(v.tags).toBe('—');
    expect(v.flags).toBe('');
  });
});

describe('projectOptions', () => {
  it('keeps projects with at least one open task that has a role and sold hours', () => {
    const mk = (id, tasks) => ({ id, name: `P-${id}`, tasks });
    const out = projectOptions([
      mk('a', [{ name: 'T', completed: false, resources: [{ role: 'DEV', soldHours: 10 }] }]),
      mk('b', [{ name: 'T', completed: true, resources: [{ role: 'DEV', soldHours: 10 }] }]),
      mk('c', [{ name: 'T', completed: false, resources: [{ role: 'DEV', soldHours: 0 }] }]),
      mk('d', []),
    ]);
    expect(out.map(o => o.id)).toEqual(['a']);
  });
});

describe('starterPrompts / tableTitle', () => {
  it('builds prompts from the project roles', () => {
    const p = starterPrompts(['DEV', 'PM']);
    expect(p[0]).toMatch(/best team/i);
    expect(p.some(x => x.includes('DEV'))).toBe(true);
  });
  it('titles', () => {
    expect(tableTitle('best')).toBe('Best team');
    expect(tableTitle('alternative')).toBe('Alternative team');
    expect(tableTitle('available')).toBe('Available team');
  });
});

describe('isStaleResponse', () => {
  it('is stale when the selected project changed while the request was in flight', () => {
    expect(isStaleResponse('a', 'b')).toBe(true);
    expect(isStaleResponse('a', '')).toBe(true);
    expect(isStaleResponse('a', 'a')).toBe(false);
  });
});

describe('chatPayload', () => {
  const mk = (n, extra = {}) => Array.from({ length: n }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `m${i}`, ...extra }));
  it('sends at most the last 20 messages, as { role, content } only', () => {
    const out = chatPayload(mk(30));
    expect(out.length).toBe(20);
    expect(out[19].content).toBe('m29');
    expect(Object.keys(out[0]).sort()).toEqual(['content', 'role']);
  });
  it('excludes local error bubbles', () => {
    const msgs = [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'Sorry', local: true }, { role: 'user', content: 'b' }];
    expect(chatPayload(msgs).map(m => m.content)).toEqual(['a', 'b']);
  });
  it('trims before filtering nothing away from the window: local bubbles do not shrink the 20-message window', () => {
    const msgs = mk(25).map((m, i) => (i === 24 ? m : i % 5 === 0 ? { ...m, local: true } : m));
    expect(chatPayload(msgs).length).toBeLessThanOrEqual(20);
  });
});
