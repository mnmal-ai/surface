/**
 * An answer's inline Markdown as styled spans: `**bold**`, `*italic*` / `_italic_`,
 * `` `code` ``. Inline only: block markup is all but absent from answers, and Ink
 * already breaks a `<Text>` on `\n`.
 *
 * A marker is styled only when it can only be markup, and otherwise left exactly as written: an
 * answer is prose about arbitrary things (`5 * 3 = 15`, `alpha_prime_v3`, `Ænima*`). The rules are
 * CommonMark's flanking rules, cut down: an opening delimiter is followed by a non-space, a
 * closing one preceded by one, and an underscore is never inside a word. A marker that finds no
 * partner stays literal.
 */

export type MarkdownStyle = 'bold' | 'italic' | 'code';

export interface MarkdownSpan {
  readonly text: string;
  readonly style?: MarkdownStyle;
}

const WORD = /[\p{L}\p{N}]/u;
const isWord = (ch: string | undefined): boolean => ch !== undefined && WORD.test(ch);
const isSpace = (ch: string | undefined): boolean => ch === undefined || /\s/.test(ch);

/**
 * Where `delim` closes an emphasis run opened at `open` (the index just after the opening
 * delimiter), or -1. Never across a line break: a stray marker must not style the rest of an
 * answer.
 */
function closing(text: string, open: number, delim: string): number {
  for (let i = open + 1; i <= text.length - delim.length; i++) {
    if (text[i] === '\n') return -1;
    if (!text.startsWith(delim, i)) continue;
    // A closer is preceded by a non-space, and a single `*` must not be half of a `**`.
    if (isSpace(text[i - 1])) continue;
    if (delim === '*' && (text[i + 1] === '*' || text[i - 1] === '*')) continue;
    if (delim.startsWith('_') && isWord(text[i + delim.length])) continue;
    return i;
  }
  return -1;
}

/** The answer cut into plain and styled spans. Markers that are not markup stay in the text. */
export function markdownSpans(text: string): MarkdownSpan[] {
  const spans: MarkdownSpan[] = [];
  let plain = '';
  const emit = (span: MarkdownSpan): void => {
    if (plain !== '') spans.push({ text: plain });
    plain = '';
    spans.push(span);
  };
  let i = 0;
  while (i < text.length) {
    const next = styledAt(text, i);
    if (next === null) {
      plain += text[i];
      i++;
      continue;
    }
    emit(next.span);
    i = next.end;
  }
  if (plain !== '') spans.push({ text: plain });
  return spans;
}

/** The styled span that starts at `i`, and the index just past it; null when `i` is plain. */
function styledAt(text: string, i: number): { span: MarkdownSpan; end: number } | null {
  // `code` — taken literally; nothing inside it is markup.
  if (text[i] === '`') {
    const end = text.indexOf('`', i + 1);
    if (end > i + 1 && !text.slice(i + 1, end).includes('\n')) {
      return { span: { text: text.slice(i + 1, end), style: 'code' }, end: end + 1 };
    }
    return null;
  }
  // **bold** (or __bold__) before *italic*: the longer delimiter wins.
  for (const [delim, style] of [
    ['**', 'bold'],
    ['__', 'bold'],
    ['*', 'italic'],
    ['_', 'italic']
  ] as const) {
    if (!text.startsWith(delim, i)) continue;
    const after = i + delim.length;
    // An opener is followed by a non-space; an underscore opener is not inside a word; a single
    // `*` that is really the start of `**` is not an italic opener.
    if (isSpace(text[after])) return null;
    if (delim.startsWith('_') && isWord(text[i - 1])) return null;
    if (delim === '*' && text[after] === '*') return null;
    const end = closing(text, after - 1, delim);
    if (end < 0 || end === after) return null;
    return { span: { text: text.slice(after, end), style }, end: end + delim.length };
  }
  return null;
}
