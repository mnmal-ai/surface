import { describe, expect, it } from 'vitest';
import { cellWidth, cutToWidth, padCells, truncateCells } from '../src/cells.js';

/** Widths are terminal columns: a CJK character is two of them. */
describe('cells', () => {
  it('measures a CJK title as a terminal draws it', () => {
    expect(cellWidth('東京の夜')).toBe(8);
    expect(cellWidth('Heat')).toBe(4);
  });

  it('cuts on whole characters, never inside a wide one', () => {
    expect(cutToWidth('東京の夜', 5)).toBe('東京');
    expect(truncateCells('東京の夜', 5)).toBe('東京…');
    expect(cellWidth(truncateCells('東京の夜 30', 7))).toBeLessThanOrEqual(7);
  });

  it('pads to exactly the width asked, left or right', () => {
    expect(cellWidth(padCells('東京', 10))).toBe(10);
    expect(padCells('3', 4, true)).toBe('   3');
  });
});
