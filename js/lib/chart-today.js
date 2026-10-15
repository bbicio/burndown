// Chart.js plugin drawing the "Today" pill above point `index` of dataset 0. Shared by
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
      const x = point.x, y = point.y - 12;
      ctx.fillStyle = bg;
      const r = 4;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x - boxW / 2, y - boxH, boxW, boxH, r);
      else ctx.rect(x - boxW / 2, y - boxH, boxW, boxH);
      ctx.fill();
      ctx.fillStyle = fg;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x, y - boxH / 2);
      ctx.restore();
    },
  };
}

window.todayLabelPlugin = todayLabelPlugin;
