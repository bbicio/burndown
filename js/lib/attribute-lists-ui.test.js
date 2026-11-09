import { describe, it, expect } from 'vitest';
import {
  itemCounts, filterItems, topicCounts, filterTopics, descriptionsText, mergeTargetOptions, emptyItemsLine,
} from './attribute-lists-ui.js';

const item = (id, label, active = true) => ({ id, label, status: active ? 'active' : 'inactive' });
const ITEMS = [item(1, 'Italy'), item(2, 'Spain'), item(3, 'France', false), item(4, 'Città')];

describe('itemCounts', () => {
  it('counts only the items that pass the search', () => {
    const items = [item(1, 'Italy'), item(2, 'Spain'), item(3, 'France', false)];
    expect(itemCounts(items, 'ita')).toEqual({ active: 1, inactive: 0, all: 1 });
  });
  it('counts everything without a search', () => {
    const items = [item(1, 'Italy'), item(2, 'Spain'), item(3, 'France', false)];
    expect(itemCounts(items)).toEqual({ active: 2, inactive: 1, all: 3 });
  });
});

describe('filterItems', () => {
  it('keeps only active items by default', () => {
    expect(filterItems(ITEMS, {}).map(i => i.id)).toEqual([1, 2, 4]);
  });
  it('keeps inactive items only with inactive', () => {
    expect(filterItems(ITEMS, { status: 'inactive' }).map(i => i.id)).toEqual([3]);
  });
  it('keeps all items with all', () => {
    expect(filterItems(ITEMS, { status: 'all' }).map(i => i.id)).toEqual([1, 2, 3, 4]);
  });
  it('trims and ignores case', () => {
    expect(filterItems(ITEMS, { status: 'all', text: ' FRAN ' }).map(i => i.id)).toEqual([3]);
  });
  it('ignores accents', () => {
    expect(filterItems(ITEMS, { status: 'all', text: 'citta' }).map(i => i.id)).toEqual([4]);
  });
});

const topic = (id, name, status, usage_count = 0) => ({ id, name, status, usage_count });

describe('topicCounts', () => {
  it('counts per status', () => {
    const t = [topic(1, 'a', 'proposed'), topic(2, 'b', 'proposed'), topic(3, 'c', 'approved'), topic(4, 'd', 'rejected')];
    expect(topicCounts(t)).toEqual({ proposed: 2, approved: 1, rejected: 1 });
  });
});

describe('filterTopics', () => {
  it('orders proposed topics by usage desc, then name', () => {
    const t = [topic(1, 'B', 'proposed', 1), topic(2, 'A', 'proposed', 1), topic(3, 'C', 'proposed', 4), topic(4, 'Z', 'approved', 9)];
    expect(filterTopics(t, { status: 'proposed' }).map(x => x.name)).toEqual(['C', 'A', 'B']);
  });
  it('orders approved topics by name', () => {
    const t = [topic(1, 'beta', 'approved', 9), topic(2, 'Alpha', 'approved', 1), topic(3, 'C', 'proposed', 4)];
    expect(filterTopics(t, { status: 'approved' }).map(x => x.name)).toEqual(['Alpha', 'beta']);
  });
  it('filters by search text', () => {
    const t = [topic(1, 'Oncology', 'approved'), topic(2, 'Cardiology', 'approved')];
    expect(filterTopics(t, { status: 'approved', text: ' onco' }).map(x => x.id)).toEqual([1]);
  });
});

describe('descriptionsText', () => {
  it('uses the singular for one', () => { expect(descriptionsText(1)).toBe('1 description'); });
  it('uses the plural for zero', () => { expect(descriptionsText(0)).toBe('0 descriptions'); });
  it('uses the plural for many', () => { expect(descriptionsText(5)).toBe('5 descriptions'); });
});

describe('mergeTargetOptions', () => {
  const T = [
    topic(1, 'Zeta', 'approved', 4), topic(2, 'Alpha', 'approved', 1), topic(3, 'Prop B', 'proposed', 2),
    topic(4, 'Prop A', 'proposed', 0), topic(5, 'Gone', 'rejected', 3),
  ];
  it('offers only approved targets for an approved source', () => {
    expect(mergeTargetOptions(T, T[0])).toEqual([
      { group: 'Approved' },
      { id: 2, label: 'Alpha', hint: '1 description' },
    ]);
  });
  it('offers approved then proposed targets for a proposed source', () => {
    expect(mergeTargetOptions(T, T[2])).toEqual([
      { group: 'Approved' },
      { id: 2, label: 'Alpha', hint: '1 description' },
      { id: 1, label: 'Zeta', hint: '4 descriptions' },
      { group: 'Proposed' },
      { id: 4, label: 'Prop A', hint: '0 descriptions' },
    ]);
  });
});

describe('emptyItemsLine', () => {
  it('names the status and the search', () => {
    expect(emptyItemsLine('inactive', 'spain')).toBe('No inactive values contain "spain".');
  });
  it('names the status without a search', () => {
    expect(emptyItemsLine('active', '')).toBe('There are no active values in this list.');
  });
  it('drops the status word for all', () => {
    expect(emptyItemsLine('all', 'x')).toBe('No values contain "x".');
  });
});
