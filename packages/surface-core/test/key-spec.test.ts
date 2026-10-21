import { describe, expect, it } from 'vitest';
import { normaliseKeySpec } from '../src/key-spec.js';

describe('normaliseKeySpec', () => {
  it.each([
    ['Ctrl+P', 'ctrl+p'],
    ['META+X', 'meta+x'],
    [' ctrl+p ', 'ctrl+p'],
    ['ESC', 'escape'],
    ['Return', 'enter'],
    ['PgUp', 'pageup'],
    ['pgdn', 'pagedown'],
    ['Tab', 'tab'],
    ['UP', 'up'],
    ['P', 'P'],
    ['p', 'p'],
    ['/', '/'],
    [' ', ' '],
    ['Space', ' ']
  ])('%s -> %s', (input, out) => {
    expect(normaliseKeySpec(input)).toBe(out);
  });

  it.each(['ctrl+shift+p', 'shift+x', 'f5', '', 'ctrl+ab', 'ctrl+'])('%j throws', (input) => {
    expect(() => normaliseKeySpec(input)).toThrow(/can never be produced by a key event/);
  });
});
