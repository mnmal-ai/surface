import { describe, expect, it } from 'vitest';
import { BOX_CHASE, BRAILLE_RING, SPINNER, spinnerFrame } from '../src/spinner.js';

describe('spinner', () => {
  it('is the braille ring — the operator picked it', () => {
    expect(SPINNER).toBe(BRAILLE_RING);
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((f) => spinnerFrame(f)).join('')).toBe('⣾⣽⣻⢿⡿⣟⣯⣷');
  });

  it('keeps the box chase available, clockwise round a 2×2 cell', () => {
    expect([0, 1, 2, 3].map((f) => spinnerFrame(f, BOX_CHASE))).toEqual(['▘', '▝', '▗', '▖']);
  });

  it('wraps, and never produces an empty frame', () => {
    expect(spinnerFrame(8)).toBe('⣾');
    expect(spinnerFrame(-1)).toBe('⣷');
    for (let f = 0; f < 50; f += 1) expect(spinnerFrame(f)).toHaveLength(1);
  });

  it('every frame is one glyph wide, so the word beside it never shifts', () => {
    for (const set of [BOX_CHASE, BRAILLE_RING]) {
      for (const g of set) expect([...g]).toHaveLength(1);
    }
  });
});
