import { describe, expect, it } from 'vitest';
import { CTRL_C_WINDOW_MS, ctrlC } from '../src/exit-chord.js';

describe('ctrlC — two presses to leave (operator, 2026-09-18)', () => {
  it('a first press only ARMS — a missed shift on ctrl-shift-c must not end the session', () => {
    expect(ctrlC(null, 10_000)).toBe('arm');
  });

  it('a second press inside the window leaves', () => {
    expect(ctrlC(10_000, 10_000 + 400)).toBe('exit');
    expect(ctrlC(10_000, 10_000 + CTRL_C_WINDOW_MS)).toBe('exit');
  });

  it('a press AFTER the window only re-arms — an old stray press is not a loaded gun', () => {
    expect(ctrlC(10_000, 10_000 + CTRL_C_WINDOW_MS + 1)).toBe('arm');
  });
});
