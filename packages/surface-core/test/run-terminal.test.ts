import { describe, expect, it } from 'vitest';
import { runTerminalOptions } from '../src/app.js';

describe('what run() prepares the terminal with', () => {
  it('by default: the anchoring the app runs with, everything else defaulted', () => {
    expect(runTerminalOptions({})).toEqual({ anchor: false });
    expect(runTerminalOptions({ anchored: true })).toEqual({ anchor: true });
  });

  it('terminal: false — the host prepared it already, so run() prepares nothing', () => {
    expect(runTerminalOptions({ terminal: false })).toBeNull();
    expect(runTerminalOptions({ anchored: true, terminal: false })).toBeNull();
  });

  it("the host's options pass through: ground, clear, and an explicit anchor", () => {
    expect(runTerminalOptions({ terminal: { ground: 'none', clear: false } })).toEqual({
      anchor: false,
      ground: 'none',
      clear: false
    });
    expect(runTerminalOptions({ anchored: true, terminal: { anchor: false } })).toEqual({
      anchor: false
    });
  });
});
