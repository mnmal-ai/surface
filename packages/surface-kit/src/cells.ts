/**
 * Columns are cells, not code units: `.length` counts a CJK character as one column where
 * a terminal draws two. `string-width` is the measure Ink lays out with, so the two cannot
 * disagree, and cuts fall on grapheme boundaries, never inside a character.
 */
import stringWidth from 'string-width';

/** Terminal columns `s` occupies. */
export const cellWidth = (s: string): number => stringWidth(s);

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** The longest prefix of `s` that fits in `max` columns, never splitting a character. */
export function cutToWidth(s: string, max: number): string {
  let out = '';
  let used = 0;
  for (const { segment } of graphemes.segment(s)) {
    const w = cellWidth(segment);
    if (used + w > max) break;
    out += segment;
    used += w;
  }
  return out;
}

/** `s` in at most `max` columns, ending in `…` when anything was cut. */
export function truncateCells(s: string, max: number): string {
  if (max <= 1) return cutToWidth(s, Math.max(0, max));
  return cellWidth(s) <= max ? s : `${cutToWidth(s, max - 1)}…`;
}

/** `s` cut and padded to exactly `width` columns, right-aligned when asked. */
export function padCells(s: string, width: number, right = false): string {
  const clipped = truncateCells(s, width);
  const pad = ' '.repeat(Math.max(0, width - cellWidth(clipped)));
  return right ? pad + clipped : clipped + pad;
}
