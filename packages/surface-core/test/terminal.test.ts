import { describe, expect, it } from 'vitest';
import {
  anchorPadding,
  CLEAR_PANE,
  groundSequence,
  liveShrink,
  prepareSequence,
  prepareTerminal,
  RESET_GROUND,
  reflowSequence,
  reprintStart,
  type TerminalProcess
} from '../src/terminal.js';

function fakeProc() {
  const listeners = new Map<string, () => void>();
  const exits: number[] = [];
  const proc: TerminalProcess = {
    once(event: string, l: () => void) {
      listeners.set(event, l);
      return proc;
    },
    exit(code: number): never {
      exits.push(code);
      listeners.get('exit')?.();
      return undefined as never;
    }
  };
  return { proc, listeners, exits };
}

function fakeOut(isTTY = true, rows = 5) {
  const written: string[] = [];
  return { out: { isTTY, rows, write: (c: string) => written.push(c) }, written };
}

describe('terminal sequences', () => {
  it('ground defaults to black via OSC 11', () => {
    expect(groundSequence(undefined)).toBe('\x1b]11;#000000\x07');
    expect(groundSequence(' #13171e ')).toBe('\x1b]11;#13171e\x07');
  });
  it('none, empty and anything but #rrggbb write nothing', () => {
    for (const g of ['none', 'NONE', '', 'red', '#fff', '#00000g', '#000000\x07\x1b]0;pwn']) {
      expect(groundSequence(g)).toBeNull();
    }
  });
  it('anchor padding puts the cursor on the last row', () => {
    expect(anchorPadding(24)).toBe('\n'.repeat(23));
    expect(anchorPadding(undefined)).toBe('');
    expect(anchorPadding(1)).toBe('');
    expect(anchorPadding(Number.NaN)).toBe('');
  });
  it('prepare writes ground, then clear, then anchor; each can be turned off', () => {
    expect(prepareSequence(3)).toBe(`\x1b]11;#000000\x07${CLEAR_PANE}\n\n`);
    expect(prepareSequence(3, { ground: 'none', clear: false, anchor: false })).toBe('');
    expect(prepareSequence(3, { clear: false })).toBe('\x1b]11;#000000\x07\n\n');
  });
});

describe('prepareTerminal', () => {
  it('off a TTY writes nothing and registers nothing', () => {
    const { out, written } = fakeOut(false);
    const { proc, listeners } = fakeProc();
    prepareTerminal(out, {}, proc)();
    expect(written).toEqual([]);
    expect(listeners.size).toBe(0);
  });
  it('restores the ground exactly once, on exit or by hand', () => {
    const { out, written } = fakeOut();
    const { proc, listeners } = fakeProc();
    const restore = prepareTerminal(out, {}, proc);
    expect(written[0]).toBe(prepareSequence(5));
    restore();
    listeners.get('exit')?.();
    expect(written.filter((w) => w === RESET_GROUND)).toHaveLength(1);
  });
  it('SIGHUP, SIGTERM and SIGINT exit through the restore', () => {
    for (const [sig, code] of [
      ['SIGHUP', 129],
      ['SIGTERM', 143],
      ['SIGINT', 130]
    ] as const) {
      const { out, written } = fakeOut();
      const { proc, listeners, exits } = fakeProc();
      prepareTerminal(out, {}, proc);
      listeners.get(sig)?.();
      expect(exits).toEqual([code]);
      expect(written).toContain(RESET_GROUND);
    }
  });
  it('with ground none there is nothing to restore', () => {
    const { out, written } = fakeOut();
    const { proc, listeners } = fakeProc();
    prepareTerminal(out, { ground: 'none' }, proc)();
    expect(written).toEqual([`${CLEAR_PANE}\n\n\n\n`]);
    expect(listeners.size).toBe(0);
  });
});

describe('reflowSequence — a re-lay is redone, not patched', () => {
  it('wipes the pane and its scrollback, then anchors the input to the last row', () => {
    expect(reflowSequence(30)).toBe(CLEAR_PANE + anchorPadding(30));
    expect(reflowSequence(30).split('\n')).toHaveLength(30);
  });

  it('still clears when the height is unknown', () => {
    expect(reflowSequence(undefined)).toBe(CLEAR_PANE);
  });
});

describe('liveShrink — keeping the input on the last row', () => {
  const at = (height: number, committed = 3, epoch = 0) => ({ height, committed, epoch });

  it('is the rows the live region gave up when nothing was printed above it', () => {
    expect(liveShrink(at(10), at(4))).toBe(6);
  });

  it('is zero when it grew, on the first measure, after a print, or after a re-lay', () => {
    expect(liveShrink(at(4), at(10))).toBe(0);
    expect(liveShrink(null, at(4))).toBe(0);
    expect(liveShrink(at(10, 3), at(4, 5))).toBe(0);
    expect(liveShrink(at(10, 3, 0), at(4, 3, 1))).toBe(0);
  });
});

describe('reprintStart', () => {
  it('keeps the newest entries that fit the budget', () => {
    expect(reprintStart([], 10)).toBe(0);
    expect(reprintStart([3, 3, 3], 10)).toBe(0);
    expect(reprintStart([3, 3, 3, 3], 10)).toBe(1);
    expect(reprintStart([5, 1, 4, 5], 10)).toBe(1);
    expect(reprintStart([5, 2, 4, 5], 10)).toBe(2);
  });

  it('always keeps the newest entry, however tall', () => {
    expect(reprintStart([1, 50], 10)).toBe(1);
    expect(reprintStart([50], 10)).toBe(0);
  });
});
