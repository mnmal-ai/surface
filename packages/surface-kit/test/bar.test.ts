import { describe, expect, it } from 'vitest';
import { BAR_GLYPH, barFrame } from '../src/bar.js';

describe('barFrame', () => {
  it('is always exactly `width` cells, so the status text beside it never jumps', () => {
    for (let f = 0; f < 40; f += 1) expect(barFrame(f, 8)).toHaveLength(8);
  });

  it('has one full-intensity head that bounces end to end and back', () => {
    const head = (f: number) => barFrame(f, 5).indexOf(3);
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8].map(head)).toEqual([0, 1, 2, 3, 4, 3, 2, 1, 0]);
  });

  it('fades over two cells either side, then the track', () => {
    expect(barFrame(3, 7)).toEqual([0, 1, 2, 3, 2, 1, 0]);
  });

  it('survives degenerate widths', () => {
    expect(barFrame(5, 1)).toEqual([3]);
    expect(barFrame(5, 0)).toEqual([]);
  });

  it('is drawn with a THIN glyph — the full-height shade blocks were too tall', () => {
    expect(BAR_GLYPH).toBe('━');
  });
});
