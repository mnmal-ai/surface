// The input line as text plus a cursor, so a typo can be corrected where it is. Pure, like
// `format.ts` and `palette.ts`: every key's effect is tested without a terminal.
//
// The bindings are readline's, because that is what a terminal's hands already know: arrows and
// Home/End move; Ctrl or Alt with an arrow moves by word; Ctrl-A/E jump to the ends; Backspace
// deletes before the cursor and Ctrl-D under it; Ctrl-U, Ctrl-K and Ctrl-W delete to the start,
// to the end, and the word before.
import { applyInput } from './apply-input.js';

export interface Draft {
  readonly text: string;
  /** 0..text.length — the position a typed character is inserted at. */
  readonly cursor: number;
}

export const EMPTY_DRAFT: Draft = { text: '', cursor: 0 };

/** A whole new line with the cursor at its end — a completion, or a cleared input. */
export function atEnd(text: string): Draft {
  return { text, cursor: text.length };
}

/** The subset of Ink's key flags the editor reads. */
export interface EditKeys {
  readonly leftArrow?: boolean;
  readonly rightArrow?: boolean;
  readonly home?: boolean;
  readonly end?: boolean;
  readonly backspace?: boolean;
  readonly delete?: boolean;
  readonly ctrl?: boolean;
  readonly meta?: boolean;
}

const isWord = (ch: string | undefined): boolean => ch !== undefined && /[\p{L}\p{N}_'-]/u.test(ch);

const SEGMENTER = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** The text as grapheme clusters with their code-unit bounds. The cursor is always one of these,
 * so a step or a delete never leaves half an emoji or a bare combining mark behind. */
const clusters = (text: string): readonly { input: string; index: number; end: number }[] => {
  const out: { input: string; index: number; end: number }[] = [];
  for (const s of SEGMENTER.segment(text)) {
    out.push({ input: s.segment, index: s.index, end: s.index + s.segment.length });
  }
  return out;
};

/** Start of the word before the cursor, skipping the spaces in between. */
export function wordLeft(text: string, from: number): number {
  const cs = clusters(text);
  let j = 0;
  while (j < cs.length && (cs[j]?.end ?? text.length) <= from) j++;
  while (j > 0 && !isWord(cs[j - 1]?.input)) j--;
  while (j > 0 && isWord(cs[j - 1]?.input)) j--;
  return j < cs.length ? (cs[j]?.index ?? 0) : text.length;
}

/** End of the word after the cursor, skipping the spaces in between. */
export function wordRight(text: string, from: number): number {
  const cs = clusters(text);
  let j = 0;
  while (j < cs.length && (cs[j]?.end ?? text.length) <= from) j++;
  while (j < cs.length && !isWord(cs[j]?.input)) j++;
  while (j < cs.length && isWord(cs[j]?.input)) j++;
  return j < cs.length ? (cs[j]?.index ?? text.length) : text.length;
}

/**
 * A key that moves or deletes, applied — or null when the key is not an editing key, so the
 * caller carries on to typing and submitting.
 *
 * Backspace and Delete both delete before the cursor. Terminals disagree about which byte the
 * Backspace key sends, and Ink reports the common one (0x7f) as `delete`; treating it as a
 * forward delete would make the key nearly everyone presses delete the wrong character. Deleting
 * under the cursor is Ctrl-D, which no terminal sends by accident.
 */
export function editKey(d: Draft, input: string, key: EditKeys): Draft | null {
  const { text, cursor } = d;
  const to = (c: number): Draft => ({ text, cursor: Math.max(0, Math.min(text.length, c)) });
  const cut = (from: number, until: number): Draft => ({
    text: text.slice(0, from) + text.slice(until),
    cursor: from
  });
  const byWord = key.ctrl === true || key.meta === true;
  const cs = clusters(text);
  /** The boundary before this one: the start of the cluster the cursor sits behind. */
  const before = (c: number): number => {
    let i = 0;
    while (i < cs.length && (cs[i]?.end ?? text.length) <= c) i++;
    return i > 0 ? (cs[i - 1]?.index ?? 0) : 0;
  };
  /** The boundary after this one: the end of the cluster under the cursor. */
  const after = (c: number): number => {
    let i = 0;
    while (i < cs.length && (cs[i]?.end ?? text.length) <= c) i++;
    return i < cs.length ? (cs[i]?.end ?? text.length) : text.length;
  };

  if (key.leftArrow) return to(byWord ? wordLeft(text, cursor) : before(cursor));
  if (key.rightArrow) return to(byWord ? wordRight(text, cursor) : after(cursor));
  if (key.home || (key.ctrl && input === 'a')) return to(0);
  if (key.end || (key.ctrl && input === 'e')) return to(text.length);
  if (key.meta && input === 'b') return to(wordLeft(text, cursor));
  if (key.meta && input === 'f') return to(wordRight(text, cursor));
  if (key.backspace || key.delete) return cursor === 0 ? d : cut(before(cursor), cursor);
  if (key.ctrl && input === 'd') return cursor === text.length ? d : cut(cursor, after(cursor));
  if (key.ctrl && input === 'u') return cut(0, cursor);
  if (key.ctrl && input === 'k') return cut(cursor, text.length);
  if (key.ctrl && input === 'w') return cut(wordLeft(text, cursor), cursor);
  return null;
}

/**
 * Typed or piped text, inserted at the cursor. Whole lines are submitted, as `applyInput` does.
 *
 * Enter sends the whole line wherever the cursor is: correcting a typo mid-line does not mean
 * splitting the question. A chunk containing newlines is inserted at the cursor and then cut into
 * lines, and the text that followed the cursor stays after it on the unsent line.
 */
export function insertChunk(d: Draft, chunk: string): { draft: Draft; submit: string[] } {
  if (chunk === '\n' || chunk === '\r') {
    const next = applyInput(d.text, '\n');
    return { draft: atEnd(next.draft), submit: next.submit };
  }
  const before = d.text.slice(0, d.cursor);
  const after = d.text.slice(d.cursor);
  if (!/[\r\n]/.test(chunk)) {
    return {
      draft: { text: before + chunk + after, cursor: d.cursor + chunk.length },
      submit: []
    };
  }
  const next = applyInput('', before + chunk + after);
  return {
    draft: { text: next.draft, cursor: Math.max(0, next.draft.length - after.length) },
    submit: next.submit
  };
}

/**
 * A paste becomes one line of draft, and is never sent.
 *
 * `insertChunk` submits every complete line — right for a driver script piping `question\n`,
 * wrong for a human's multi-line paste. Bracketed paste (Ink's `usePaste`) routes a terminal
 * paste here instead. Line breaks fold to a single space because the draft is one line; the
 * operator edits and presses Enter. Nothing about a paste may be the Enter.
 */
export function pasteToLine(text: string): string {
  return text
    .replace(/[\t\f\v]+/g, ' ')
    .replace(/\s*(?:\r\n|\r|\n)\s*/g, ' ')
    .trim();
}

/** The grapheme cluster at a cursor boundary, or '' at the end of the line. */
export function graphemeAt(text: string, at: number): string {
  for (const s of SEGMENTER.segment(text)) {
    if (s.index >= at) return s.segment;
  }
  return '';
}

/** The draft as a masked panel draws it: one `•` per grapheme, the cursor on the same one. */
export function maskDraft(d: Draft): Draft {
  const cs = clusters(d.text);
  let before = 0;
  for (const c of cs) {
    if (c.end > d.cursor) break;
    before += 1;
  }
  return { text: '•'.repeat(cs.length), cursor: before };
}
