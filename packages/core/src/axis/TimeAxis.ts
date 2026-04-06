import type { ViewportState, Theme, DataSeries } from '@chart-lib/commons';

// Reusable Date object — avoid allocation per bar
const _date = new Date();
const _pad2 = (n: number) => n < 10 ? '0' + n : '' + n;

export class TimeAxis {
  render(ctx: CanvasRenderingContext2D, viewport: ViewportState, theme: Theme, data: DataSeries, axisYOverride?: number): void {
    const { chartRect } = viewport;
    const axisY = axisYOverride ?? (chartRect.y + chartRect.height);

    // Axis line
    ctx.strokeStyle = theme.axisLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(chartRect.x, axisY + 0.5);
    ctx.lineTo(chartRect.x + chartRect.width, axisY + 0.5);
    ctx.stroke();

    // Time labels
    const barUnit = viewport.barWidth + viewport.barSpacing;
    const minLabelSpacing = 80;
    const barsPerLabel = Math.max(1, Math.ceil(minLabelSpacing / barUnit));
    const { from, to } = viewport.visibleRange;
    const offsetX = -viewport.offset + chartRect.x + viewport.barWidth / 2;

    ctx.font = `${theme.font.sizeSmall}px ${theme.font.family}`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    ctx.fillStyle = theme.axisLabel;

    for (let i = from; i <= to && i < data.length; i++) {
      if (i % barsPerLabel !== 0) continue;
      const x = i * barUnit + offsetX;
      // Reuse single Date object
      _date.setTime(data[i].time);
      const label = `${_date.getMonth() + 1}/${_date.getDate()} ${_pad2(_date.getHours())}:${_pad2(_date.getMinutes())}`;
      ctx.fillText(label, x, axisY + 5);
    }
  }
}
