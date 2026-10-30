// What an app does to the terminal itself before the first frame, as pure byte sequences so they
// are tested rather than trusted.
//
// No alternate screen buffer: it would throw away the terminal's native scrolling, search and copy.

import { DEFAULT_GROUND } from '@mnmal-ai/surface-theme';

export { DEFAULT_GROUND };

/**
 * OSC 11 sets the terminal's default background, so every cell written without one — prose and
 * the empty space around it — sits on it; Ink could only colour what it draws. `none` (or an
 * empty value) leaves the terminal's background alone. Only `#rrggbb` is accepted: anything else
 * inside an OSC is an escape-injection seam into the operator's terminal, so it is dropped.
 */
export function groundSequence(ground: string | undefined): string | null {
  const g = (ground ?? DEFAULT_GROUND).trim();
  if (g === '' || g.toLowerCase() === 'none') return null;
  if (!/^#[0-9a-fA-F]{6}$/.test(g)) return null;
  return `\x1b]11;${g}\x07`;
}

/** OSC 111: restore the terminal's configured background. */
export const RESET_GROUND = '\x1b]111\x07';

/** Erase the visible pane (2J) and its scrollback (3J), cursor home. */
export const CLEAR_PANE = '\x1b[2J\x1b[3J\x1b[H';

/**
 * Blank lines that put the cursor on the last row before the first frame, so the input is
 * bottom-anchored: Ink draws its live region where the cursor is, and printed turns then push the
 * pane up rather than the input down.
 */
export function anchorPadding(rows: number | undefined): string {
  if (rows === undefined || !Number.isFinite(rows) || rows < 2) return '';
  return '\n'.repeat(Math.floor(rows) - 1);
}

/**
 * What a re-lay writes before the transcript is printed again: the pane and its scrollback wiped,
 * then the input anchored to the last row. A resize cannot be patched, only redone — what `Static`
 * printed was laid out at the old width — and a closed panel left the conversation scrolled up,
 * which a terminal cannot scroll back down. The cost: scrollback from before the session goes too.
 */
export function reflowSequence(rows: number | undefined): string {
  return CLEAR_PANE + anchorPadding(rows);
}

/** The live region as last measured: its height, the entries printed above it, the layout epoch. */
export interface LiveMeasure {
  readonly height: number;
  readonly committed: number;
  readonly epoch: number;
}

/**
 * Rows the live region just gave up with nothing printed above it — rows that would otherwise open
 * up below the input. Ink redraws its live region from where it began, so when it shrinks the input
 * rises; printing that many blank rows above it scrolls the pane back. Zero when something was
 * printed in the same step (the print scrolled the pane already) or after a re-lay (which anchors
 * on its own).
 */
export function liveShrink(prev: LiveMeasure | null, now: LiveMeasure): number {
  if (prev === null || now.committed !== prev.committed || now.epoch !== prev.epoch) return 0;
  return Math.max(0, prev.height - now.height);
}

/**
 * The most lines a re-lay reprints. Printing blocks input for every line (about 0.17 ms each in
 * Ink's output step), so a re-lay of a long transcript keeps only its newest entries.
 */
export const REPRINT_LINES = 1000;

/**
 * Where a re-lay starts reprinting, given each committed entry's height: the newest entries that
 * fit `budget` lines, and always the newest one, however tall.
 */
export function reprintStart(heights: readonly number[], budget: number): number {
  let lines = 0;
  for (let i = heights.length - 1; i >= 0; i--) {
    lines += heights[i] ?? 1;
    if (lines > budget) return Math.min(i + 1, heights.length - 1);
  }
  return 0;
}

export interface PrepareTerminalOptions {
  /** `#rrggbb`, or `none` to leave the background alone. Default {@link DEFAULT_GROUND}. */
  readonly ground?: string | undefined;
  /** Wipe the pane and its scrollback first. Default true. */
  readonly clear?: boolean;
  /** Bottom-anchor the input. Default true. */
  readonly anchor?: boolean;
}

export interface TerminalOut {
  readonly isTTY?: boolean;
  readonly rows?: number;
  write(chunk: string): unknown;
}

/** The bytes {@link prepareTerminal} writes, in order. */
export function prepareSequence(
  rows: number | undefined,
  opts: PrepareTerminalOptions = {}
): string {
  return (
    (groundSequence(opts.ground) ?? '') +
    (opts.clear === false ? '' : CLEAR_PANE) +
    (opts.anchor === false ? '' : anchorPadding(rows))
  );
}

/** The process hooks {@link prepareTerminal} needs; injectable for tests. */
export interface TerminalProcess {
  once(event: 'exit', listener: () => void): unknown;
  once(event: 'SIGHUP' | 'SIGTERM' | 'SIGINT', listener: () => void): unknown;
  exit(code: number): never;
}

/**
 * Ground, clear and anchor the terminal before `render`. Returns a restore function that puts the
 * terminal's background back. It is also registered on `exit`, and SIGHUP / SIGTERM / SIGINT exit
 * through it, since their default action kills the process with no `exit` event (under Ink's raw
 * mode ctrl+c is input, so SIGINT only arrives from outside: `kill -INT`, a supervisor, tmux).
 * A terminal left black is worse than any rendering bug. A no-op off a TTY.
 */
export function prepareTerminal(
  out: TerminalOut,
  opts: PrepareTerminalOptions = {},
  proc: TerminalProcess = process
): () => void {
  if (out.isTTY !== true) return () => {};
  out.write(prepareSequence(out.rows, opts));
  if (groundSequence(opts.ground) === null) return () => {};
  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    out.write(RESET_GROUND);
  };
  proc.once('exit', restore);
  proc.once('SIGHUP', () => proc.exit(129));
  proc.once('SIGTERM', () => proc.exit(143));
  proc.once('SIGINT', () => proc.exit(130));
  return restore;
}
