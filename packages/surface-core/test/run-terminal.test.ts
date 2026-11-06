import { describe, expect, it } from 'vitest';
import { runTerminalOptions } from '../src/app.js';

describe('what run() prepares the terminal with', () => {
  it('by default: the anchoring the app runs with, everything else defaulted', () => {
    expect(runTerminalOptions({}, false)).toEqual({ anchor: false });
    expect(runTerminalOptions({ anchored: true }, false)).toEqual({ anchor: true });
  });

  it('full-screen marks the preparation, which then skips clear and anchor', () => {
    expect(runTerminalOptions({ anchored: true }, true)).toEqual({
      anchor: true,
      fullscreen: true
    });
    expect(runTerminalOptions({ terminal: false }, true)).toBeNull();
    expect(runTerminalOptions({}, false)).toEqual({ anchor: false });
  });

  it('terminal: false — the host prepared it already, so run() prepares nothing', () => {
    expect(runTerminalOptions({ terminal: false }, false)).toBeNull();
    expect(runTerminalOptions({ anchored: true, terminal: false }, false)).toBeNull();
  });

  it("the host's options pass through: ground, clear, and an explicit anchor", () => {
    expect(runTerminalOptions({ terminal: { ground: 'none', clear: false } }, false)).toEqual({
      anchor: false,
      ground: 'none',
      clear: false
    });
    expect(runTerminalOptions({ anchored: true, terminal: { anchor: false } }, false)).toEqual({
      anchor: false
    });
  });
});
