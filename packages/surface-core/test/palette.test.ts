import { describe, expect, it } from 'vitest';
import {
  clampSelection,
  commandUsage,
  completeDraft,
  enterRuns,
  menuWindow,
  moveSelection,
  paletteMatches,
  paletteQuery,
  paletteRows,
  parseCommandLine
} from '../src/palette.js';

const cmd = (name: string, args: string[] = []) => ({
  name,
  summary: name,
  args: args.map((a) => ({ name: a })),
  run: () => {}
});
const cmds = [cmd('todos', ['status']), cmd('tell', ['text']), cmd('status')];

describe('palette', () => {
  it('opens on a leading slash, until the command name ends', () => {
    expect(paletteQuery('/to')).toBe('to');
    expect(paletteQuery('/')).toBe('');
    expect(paletteQuery('/todos open')).toBeNull();
    expect(paletteQuery('hello')).toBeNull();
    expect(paletteQuery('/r/techno')).toBeNull();
    expect(paletteQuery('//x')).toBeNull();
  });
  it('lists prefix matches first, then substring-only, each alphabetical', () => {
    expect(paletteMatches(cmds, 't').map((c) => c.name)).toEqual(['tell', 'todos', 'status']);
    expect(paletteMatches(cmds, 'tus').map((c) => c.name)).toEqual(['status']);
    expect(paletteMatches(cmds, 'zzz')).toEqual([]);
  });
  it('matches case-insensitively', () => {
    expect(paletteMatches(cmds, 'TO').map((c) => c.name)).toEqual(['todos']);
    expect(paletteMatches([cmd('Why')], 'w').map((c) => c.name)).toEqual(['Why']);
  });
  it('flags which rows are prefix matches', () => {
    expect(paletteRows(cmds, 't').map((r) => [r.cmd.name, r.prefix])).toEqual([
      ['tell', true],
      ['todos', true],
      ['status', false]
    ]);
  });
  describe('enterRuns', () => {
    const lib = [cmd('why'), cmd('citations'), cmd('wipe')];
    const run = (q: string, selected: number, moved: boolean) =>
      enterRuns(paletteRows(lib, q), selected, moved)?.name ?? null;
    it('runs the top row of a prefix match', () => {
      expect(run('w', 0, false)).toBe('why');
    });
    it('sends a substring-only match as typed', () => {
      expect(run('tat', 0, false)).toBeNull();
    });
    it('runs a substring-only match once the selection has moved', () => {
      expect(run('tat', 0, true)).toBe('citations');
    });
    it('treats the empty query as a prefix of everything', () => {
      expect(paletteRows(lib, '').every((r) => r.prefix)).toBe(true);
      expect(run('', 0, false)).toBe('citations');
    });
    it('returns null with no rows', () => {
      expect(run('qqq', 0, true)).toBeNull();
    });
  });
  it('opens and parses case-insensitively, lowercasing the command name only', () => {
    expect(paletteQuery('/W')).toBe('W');
    expect(paletteQuery('/Why')).toBe('Why');
    expect(parseCommandLine('/PRS a B')).toEqual({ name: 'prs', args: ['a', 'B'] });
  });
  it('wraps selection and clamps it to the list', () => {
    expect(moveSelection(0, -1, 3)).toBe(2);
    expect(moveSelection(2, 1, 3)).toBe(0);
    expect(clampSelection(5, 2)).toBe(1);
    expect(clampSelection(0, 0)).toBe(0);
  });
  it('completes a command, leaving room for its argument', () => {
    expect(completeDraft(cmd('todos', ['status']))).toBe('/todos ');
    expect(completeDraft(cmd('status'))).toBe('/status');
    expect(commandUsage(cmd('todos', ['status']))).toBe('/todos <status>');
  });
  it('parses a command line into name and arguments', () => {
    expect(parseCommandLine('/todos open  web')).toEqual({
      name: 'todos',
      args: ['open', 'web']
    });
    expect(parseCommandLine('hello')).toBeNull();
  });
});

describe('menuWindow', () => {
  it('shows everything, with no position, when it fits', () => {
    expect(menuWindow(4, 3, 10)).toEqual({ start: 0, end: 4, position: '' });
  });
  it('centres on the selection and clamps at both ends', () => {
    expect(menuWindow(15, 0, 5)).toEqual({ start: 0, end: 5, position: ' · 1–5 of 15' });
    expect(menuWindow(15, 7, 5)).toEqual({ start: 5, end: 10, position: ' · 6–10 of 15' });
    expect(menuWindow(15, 14, 5)).toEqual({ start: 10, end: 15, position: ' · 11–15 of 15' });
  });
  it('never takes fewer than one row', () => {
    expect(menuWindow(3, 2, 0)).toEqual({ start: 2, end: 3, position: ' · 3–3 of 3' });
  });
});
