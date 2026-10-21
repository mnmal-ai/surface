/**
 * ↑/↓ walk the operator's previous turns, like a shell.
 *
 * - a bounded ring (HISTORY_MAX), for this session only;
 * - only conversation turns are kept, not slash commands, which would stand between the
 *   operator and the turn they want to redo;
 * - a recalled turn lands in the line editable, and sending it sends a new turn;
 * - the draft being typed is kept at the bottom, so walking up and back loses nothing;
 * - in a multi-line draft, ↑ walks only from the first line and ↓ only from the last, so the
 *   arrows still move the cursor inside a long paste.
 *
 * Pure: the component holds a `HistoryState` and asks these functions what to do.
 */

export const HISTORY_MAX = 100;

export interface HistoryState {
  /** Oldest first. */
  readonly entries: readonly string[];
  /** Which entry is showing, or null when the line holds the operator's own draft. */
  readonly at: number | null;
  /** The draft being typed when ↑ was first pressed, restored on walking back down. */
  readonly stash: string;
}

export const EMPTY_HISTORY: HistoryState = { entries: [], at: null, stash: '' };

/**
 * Remember a sent line. Blank lines, slash commands and a straight repeat of the last one are not
 * kept — but sending any of them still ends a walk, so the next ↑ starts from the newest turn.
 */
export function remember(h: HistoryState, line: string): HistoryState {
  const text = line.trim();
  const entries =
    text === '' || text.startsWith('/') || h.entries[h.entries.length - 1] === text
      ? h.entries
      : [...h.entries, text].slice(-HISTORY_MAX);
  return { entries, at: null, stash: '' };
}

/** Whether an arrow may walk history from here, rather than move the cursor in a long draft. */
export function mayWalk(draft: string, cursor: number, dir: 'up' | 'down'): boolean {
  if (!draft.includes('\n')) return true;
  return dir === 'up'
    ? !draft.slice(0, cursor).includes('\n')
    : !draft.slice(cursor).includes('\n');
}

/**
 * One step. Returns the new state and the text the line should now hold, or null when there is
 * nowhere to go (↓ from the draft, ↑ past the oldest entry, or no history at all).
 */
export function walk(
  h: HistoryState,
  dir: 'up' | 'down',
  draft: string
): { state: HistoryState; text: string } | null {
  if (h.entries.length === 0) return null;
  if (dir === 'up') {
    if (h.at === null) {
      const at = h.entries.length - 1;
      return { state: { ...h, at, stash: draft }, text: h.entries[at] ?? '' };
    }
    if (h.at === 0) return null;
    const at = h.at - 1;
    return { state: { ...h, at }, text: h.entries[at] ?? '' };
  }
  if (h.at === null) return null;
  if (h.at >= h.entries.length - 1) {
    return { state: { ...h, at: null, stash: '' }, text: h.stash };
  }
  const at = h.at + 1;
  return { state: { ...h, at }, text: h.entries[at] ?? '' };
}

/** The recalled line was edited: it is a draft now, no longer a position in the history. */
export const settle = (h: HistoryState): HistoryState =>
  h.at === null ? h : { ...h, at: null, stash: '' };
