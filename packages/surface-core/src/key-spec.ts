const NAMED = new Set([
  'escape',
  'enter',
  'tab',
  'up',
  'down',
  'left',
  'right',
  'pageup',
  'pagedown',
  'home',
  'end',
  'backspace',
  'delete'
]);
const ALIASES: Readonly<Record<string, string>> = {
  esc: 'escape',
  return: 'enter',
  pgup: 'pageup',
  pgdn: 'pagedown',
  space: ' '
};

const single = (s: string): boolean => [...s].length === 1;

/** Maps a binding string to the canonical form a key event is resolved to. Throws if no event can produce it. */
export function normaliseKeySpec(spec: string): string {
  // A space is its own keystroke (Ink reports input ' '), so it must survive the trim.
  if (spec === ' ') return ' ';
  const s = spec.trim();
  const lower = s.toLowerCase();
  const named = ALIASES[lower] ?? lower;
  if (NAMED.has(named) || named === ' ') return named;
  const mod = /^(ctrl|meta)\+(.+)$/i.exec(s);
  if (mod?.[1] && mod[2] !== undefined && single(mod[2])) {
    return `${mod[1].toLowerCase()}+${mod[2].toLowerCase()}`;
  }
  if (single(s)) return s;
  throw new Error(`key spec '${spec}' can never be produced by a key event`);
}
