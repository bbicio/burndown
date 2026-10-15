// Chart.js plugin drawing the "Today" pill above point `index` of dataset 0 (below it when
// there is no room above). Shared by
// program.html's and portfolio.html's burndown charts; `bg`/`fg` are resolved colours
// (Chart.js cannot resolve var()). No-op when `index` is null or has no point.
export function todayLabelPlugin({ id, index, text, bg, fg }) {
  return {
    id,
    afterDraw(chart) {
      if (index === null || index === undefined) return;
      const point = chart.getDatasetMeta(0).data[index];
      if (!point) return;
      const { ctx } = chart;
      ctx.save();
      ctx.font = '600 11px sans-serif';
      const textWidth = ctx.measureText(text).width;
      const padX = 7, boxW = textWidth + padX * 2, boxH = 20;
      // Above the point when it fits, else below it; never past the left/right edges (B-077).
      const above = point.y - 12 - boxH;
      let top = above >= 0 ? above : point.y + 12;
      if (chart.height) top = Math.max(0, Math.min(top, chart.height - boxH));
      let left = point.x - boxW / 2;
      if (chart.width) left = Math.max(0, Math.min(left, chart.width - boxW));
      ctx.fillStyle = bg;
      const r = 4;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(left, top, boxW, boxH, r);
      else ctx.rect(left, top, boxW, boxH);
      ctx.fill();
      ctx.fillStyle = fg;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, left + boxW / 2, top + boxH / 2);
      ctx.restore();
    },
  };
}

window.todayLabelPlugin = todayLabelPlugin;
