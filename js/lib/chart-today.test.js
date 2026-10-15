import { describe, it, expect, vi } from 'vitest';
import { todayLabelPlugin } from './chart-today.js';

function fakeChart(points) {
  const ctx = {
    save: vi.fn(), restore: vi.fn(), fillText: vi.fn(), beginPath: vi.fn(), fill: vi.fn(), rect: vi.fn(),
    measureText: vi.fn(() => ({ width: 40 })),
  };
  return { ctx, getDatasetMeta: () => ({ data: points }) };
}

describe('todayLabelPlugin', () => {
  it('keeps the given id', () => {
    expect(todayLabelPlugin({ id: 'x', index: null, text: '', bg: 'a', fg: 'b' }).id).toBe('x');
  });

  it('draws nothing without an index', () => {
    const chart = fakeChart([{ x: 1, y: 1 }]);
    todayLabelPlugin({ id: 'x', index: null, text: 't', bg: 'a', fg: 'b' }).afterDraw(chart);
    Object.values(chart.ctx).forEach(fn => expect(fn).not.toHaveBeenCalled());
  });

  it('draws nothing when the index has no point', () => {
    const chart = fakeChart([{ x: 1, y: 1 }]);
    todayLabelPlugin({ id: 'x', index: 5, text: 't', bg: 'a', fg: 'b' }).afterDraw(chart);
    Object.values(chart.ctx).forEach(fn => expect(fn).not.toHaveBeenCalled());
  });

  it('draws the label above the point, falling back to rect without roundRect', () => {
    const chart = fakeChart([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 100, y: 50 }]);
    todayLabelPlugin({ id: 'x', index: 2, text: '12h left', bg: 'navy', fg: 'white' }).afterDraw(chart);
    expect(chart.ctx.fillText).toHaveBeenCalledTimes(1);
    expect(chart.ctx.fillText.mock.calls[0][0]).toBe('12h left');
    expect(chart.ctx.fillText.mock.calls[0][1]).toBe(100);
    expect(chart.ctx.rect).toHaveBeenCalledTimes(1);
    expect(chart.ctx.fillStyle).toBe('white');
    expect(chart.ctx.restore).toHaveBeenCalledTimes(1);
  });
});
