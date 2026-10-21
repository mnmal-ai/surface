import { describe, expect, it } from 'vitest';
import { sparkline } from '../src/sparkline.js';

const G = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

describe('sparkline', () => {
  it('maps min to the lowest glyph and max to the highest', () => {
    expect(sparkline([0, 7], G)).toBe('▁█');
  });
  it('is flat (lowest glyph) when every value is equal', () => {
    expect(sparkline([3, 3, 3], G)).toBe('▁▁▁');
  });
  it('is empty for no values', () => {
    expect(sparkline([], G)).toBe('');
  });
});
