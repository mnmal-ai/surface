// The liveness bar — a sweeping gradient, bottom-left, while anything is in flight.
//
// Liveness and cost are two signals (interaction grammar §7). During flight this says only that
// she is alive — there is deliberately no live counter beside it. The cost arrives afterwards, as
// the duration in the answer's chip.
//
// Thin, with the gradient carried by colour: shade blocks (█▓▒░) fill the whole cell height, so
// every cell is a heavy horizontal rule and the fade is colour intensity.
//
// Pure, so the motion can be tested without a terminal: the component only supplies a frame.

/** Intensity per cell, 0 (track) to 3 (head): a head fading over two cells either side. */
export function barFrame(frame: number, width = 8): number[] {
  if (width <= 0) return [];
  if (width === 1) return [3];
  // Head position bounces 0 → width-1 → 0, one cell per frame.
  const period = 2 * (width - 1);
  const p = ((frame % period) + period) % period;
  const head = p < width ? p : period - p;
  return Array.from({ length: width }, (_, i) => Math.max(0, 3 - Math.abs(i - head)));
}

/** The glyph every cell uses — thin, so the bar sits low in the line. */
export const BAR_GLYPH = '━';
