import { describe, it, expect, vi } from 'vitest';
import { todayLabelPlugin } from './chart-today.js';

function fakeChart(points, width) {
  const ctx = {
    save: vi.fn(), restore: vi.fn(), fillText: vi.fn(), beginPath: vi.fn(), fill: vi.fn(), rect: vi.fn(),
    measureText: vi.fn(() => ({ width: 40 })),
  };
  return { ctx, width, getDatasetMeta: () => ({ data: points }) };
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

  // boxW = 40 (measureText) + 2 × 7 padding = 54; boxH = 20 (B-077).
  const drawAt = (point, width = 400) => {
    const chart = fakeChart([point], width);
    todayLabelPlugin({ id: 'x', index: 0, text: 't', bg: 'a', fg: 'b' }).afterDraw(chart);
    const [left, top] = chart.ctx.rect.mock.calls[0];
    return { left, top, text: chart.ctx.fillText.mock.calls[0] };
  };
  it('draws below the point when above would leave the canvas', () => {
    const r = drawAt({ x: 200, y: 10 });
    expect(r.top).toBe(22);
    expect(r.text[2]).toBe(32);
  });
  it('keeps drawing above when there is room', () => {
    expect(drawAt({ x: 200, y: 100 }).top).toBe(68);
  });
  it('clamps the box to the left edge', () => {
    const r = drawAt({ x: 5, y: 100 });
    expect(r.left).toBe(0);
    expect(r.text[1]).toBe(27);
  });
  it('clamps the box to the right edge', () => {
    expect(drawAt({ x: 398, y: 100 }).left).toBe(346);
  });
});
