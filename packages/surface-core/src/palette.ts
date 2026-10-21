import type { CommandSpec } from './module.js';

type AnyCommand = CommandSpec<unknown>;

/** The palette's filter text: the draft after a leading '/', until the name ends. */
export function paletteQuery(draft: string): string | null {
  return /^\/[a-z0-9-]*$/i.test(draft) ? draft.slice(1) : null;
}

export interface PaletteRow {
  readonly cmd: AnyCommand;
  /** True when the name starts with the query; false when it only contains it. */
  readonly prefix: boolean;
}

/** Prefix matches first, then substring-only, each group alphabetical. Case-insensitive. */
export function paletteRows(commands: readonly AnyCommand[], query: string): PaletteRow[] {
  const q = query.toLowerCase();
  const byName = (a: PaletteRow, b: PaletteRow) => a.cmd.name.localeCompare(b.cmd.name);
  const rows: PaletteRow[] = [];
  for (const cmd of commands) {
    const name = cmd.name.toLowerCase();
    if (name.startsWith(q)) rows.push({ cmd, prefix: true });
    else if (name.includes(q)) rows.push({ cmd, prefix: false });
  }
  return [
    ...rows.filter((r) => r.prefix).sort(byName),
    ...rows.filter((r) => !r.prefix).sort(byName)
  ];
}

export function paletteMatches(commands: readonly AnyCommand[], query: string): AnyCommand[] {
  return paletteRows(commands, query).map((r) => r.cmd);
}

/**
 * The command Enter runs, or null when the line should be sent as typed. A substring-only row
 * runs only after the user moved onto it: Enter on a typo must never run a different command.
 */
export function enterRuns(
  rows: readonly PaletteRow[],
  selected: number,
  moved: boolean
): AnyCommand | null {
  const row = rows[clampSelection(selected, rows.length)];
  if (row === undefined) return null;
  return row.prefix || moved ? row.cmd : null;
}

export function moveSelection(selected: number, delta: number, count: number): number {
  if (count <= 0) return 0;
  return (((selected + delta) % count) + count) % count;
}

export function clampSelection(selected: number, count: number): number {
  return count <= 0 ? 0 : Math.min(Math.max(0, selected), count - 1);
}

export function completeDraft(c: AnyCommand): string {
  return c.args.length > 0 ? `/${c.name} ` : `/${c.name}`;
}

export function commandUsage(c: AnyCommand): string {
  const args = c.args.map((a) => (a.optional ? `[${a.name}]` : `<${a.name}>`));
  return [`/${c.name}`, ...args].join(' ');
}

export function parseCommandLine(line: string): { name: string; args: string[] } | null {
  const m = /^\/([a-z][a-z0-9-]*)(?:\s+(.*))?$/is.exec(line.trim());
  if (m === null) return null;
  const args = (m[2] ?? '')
    .trim()
    .split(/\s+/)
    .filter((a) => a !== '');
  return { name: (m[1] as string).toLowerCase(), args };
}

/** Width of the palette's name column. */
export const MENU_NAME_WIDTH = 22;

/**
 * The slice of a menu `height` rows tall, centred on the selection so moving keeps it in view, and
 * the position to show beside ↑↓ when some rows are out of view (empty when every row fits).
 */
export function menuWindow(
  count: number,
  selected: number,
  height: number
): { start: number; end: number; position: string } {
  const h = Math.max(1, Math.floor(height));
  if (count <= h) return { start: 0, end: count, position: '' };
  const start = Math.min(Math.max(0, selected - Math.floor(h / 2)), count - h);
  return { start, end: start + h, position: ` · ${start + 1}–${start + h} of ${count}` };
}
