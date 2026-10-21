/** Values scaled onto `glyphs` (lowest first). Equal values draw flat at the lowest glyph. */
export function sparkline(values: readonly number[], glyphs: readonly string[]): string {
  if (values.length === 0 || glyphs.length === 0) return '';
  const min = Math.min(...values);
  const span = Math.max(...values) - min;
  const top = glyphs.length - 1;
  return values
    .map((v) => glyphs[span === 0 ? 0 : Math.round(((v - min) / span) * top)] ?? '')
    .join('');
}
