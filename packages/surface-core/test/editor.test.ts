import { describe, expect, it } from 'vitest';
import {
  atEnd,
  type Draft,
  EMPTY_DRAFT,
  editKey,
  graphemeAt,
  insertChunk,
  maskDraft,
  pasteToLine,
  wordLeft,
  wordRight
} from '../src/editor.js';

const at = (text: string, cursor: number): Draft => ({ text, cursor });

describe('insertChunk — typing where the cursor is', () => {
  it('inserts at the cursor, not at the end — the typo fix', () => {
    expect(insertChunk(at('helo', 3), 'l')).toEqual({ draft: at('hello', 4), submit: [] });
    expect(insertChunk(EMPTY_DRAFT, 'hi').draft).toEqual(at('hi', 2));
  });

  it('sends the WHOLE line on enter, wherever the cursor is', () => {
    expect(insertChunk(at('hello world', 3), '\n')).toEqual({
      draft: EMPTY_DRAFT,
      submit: ['hello world']
    });
    expect(insertChunk(at('hello', 2), '\r').submit).toEqual(['hello']);
  });

  it('inserts a multi-line paste at the cursor and keeps what followed it unsent', () => {
    expect(insertChunk(at('ask about  please', 10), 'Orbital\nand ')).toEqual({
      draft: at('and  please', 4),
      submit: ['ask about Orbital']
    });
  });
});

describe('editKey — moving and deleting', () => {
  const word = 'what genre is Orbital 2';

  it('moves one character, clamped at both ends', () => {
    expect(editKey(at('abc', 1), '', { leftArrow: true })).toEqual(at('abc', 0));
    expect(editKey(at('abc', 0), '', { leftArrow: true })).toEqual(at('abc', 0));
    expect(editKey(at('abc', 3), '', { rightArrow: true })).toEqual(at('abc', 3));
  });

  it('jumps to either end with Home/End or Ctrl-A/Ctrl-E', () => {
    expect(editKey(at('abc', 2), '', { home: true })).toEqual(at('abc', 0));
    expect(editKey(at('abc', 0), 'e', { ctrl: true })).toEqual(at('abc', 3));
    expect(editKey(at('abc', 3), 'a', { ctrl: true })).toEqual(at('abc', 0));
  });

  it('moves by word with Ctrl or Alt and an arrow, or Alt-B/Alt-F', () => {
    expect(editKey(at(word, word.length), '', { leftArrow: true, ctrl: true })?.cursor).toBe(22);
    expect(wordLeft(word, 22)).toBe(14);
    expect(editKey(at(word, 0), '', { rightArrow: true, meta: true })?.cursor).toBe(4);
    expect(wordRight(word, 4)).toBe(10);
    expect(editKey(at(word, 10), 'b', { meta: true })?.cursor).toBe(5);
  });

  it('deletes before the cursor on Backspace, whichever flag the terminal sends', () => {
    expect(editKey(at('hexllo', 3), '', { backspace: true })).toEqual(at('hello', 2));
    expect(editKey(at('hexllo', 3), '', { delete: true })).toEqual(at('hello', 2));
    expect(editKey(at('abc', 0), '', { backspace: true })).toEqual(at('abc', 0));
  });

  it('deletes under the cursor with Ctrl-D', () => {
    expect(editKey(at('hexllo', 2), 'd', { ctrl: true })).toEqual(at('hello', 2));
    expect(editKey(at('abc', 3), 'd', { ctrl: true })).toEqual(at('abc', 3));
  });

  it('deletes to the start, to the end, or the word before with Ctrl-U / Ctrl-K / Ctrl-W', () => {
    expect(editKey(at(word, 14), 'u', { ctrl: true })).toEqual(at('Orbital 2', 0));
    expect(editKey(at(word, 13), 'k', { ctrl: true })).toEqual(at('what genre is', 13));
    expect(editKey(at(word, 13), 'w', { ctrl: true })).toEqual(at('what genre  Orbital 2', 11));
  });

  it('steps and deletes whole grapheme clusters, never half an emoji or a bare mark', () => {
    const family = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}';
    const line = `a${family}`;
    expect(editKey(at(line, line.length), '', { leftArrow: true })).toEqual(at(line, 1));
    expect(editKey(at(line, line.length), '', { backspace: true })).toEqual(at('a', 1));
    expect(editKey(at(line, 1), 'd', { ctrl: true })).toEqual(at('a', 1));
    const cafe = 'caf\u{65}\u0301';
    expect(editKey(at(cafe, cafe.length), '', { backspace: true })).toEqual(at('caf', 3));
    expect(editKey(at(cafe, 3), '', { rightArrow: true })).toEqual(at(cafe, cafe.length));
  });

  it('is not an editing key for plain typing', () => {
    expect(editKey(at('abc', 1), 'x', {})).toBeNull();
    expect(atEnd('abc')).toEqual(at('abc', 3));
  });
});

describe('pasteToLine — a paste is DRAFT, never a submission', () => {
  // Live 2026-09-18: a multi-line clipboard went through insertChunk, which submits every
  // complete line — "it literally splurged the entirety of the chat transcript back into the
  // chat window". A paste now arrives on usePaste's channel and is folded to one draft line.
  it('folds every line break to a single space', () => {
    expect(pasteToLine('Voices from the Lake\n  — Ian (Mixed)\r\nII · 22 hours ago\r')).toBe(
      'Voices from the Lake — Ian (Mixed) II · 22 hours ago'
    );
  });

  it('keeps a one-word paste exactly as copied', () => {
    expect(pasteToLine('liminal')).toBe('liminal');
  });

  it('drops the trailing newline a terminal copy often carries — it must not act as Enter', () => {
    expect(pasteToLine('what is ASMR?\n')).toBe('what is ASMR?');
    expect(pasteToLine('\n\n')).toBe('');
  });

  it('inserted through insertChunk, a folded paste submits NOTHING', () => {
    const r = insertChunk({ text: 'tell me about ', cursor: 14 }, pasteToLine('liminal\nspaces\n'));
    expect(r.submit).toEqual([]);
    expect(r.draft.text).toBe('tell me about liminal spaces');
  });
});

describe('maskDraft', () => {
  it('draws one bullet per character and keeps the cursor on the same character', () => {
    expect(maskDraft({ text: 'abc', cursor: 1 })).toEqual({ text: '•••', cursor: 1 });
  });
  it('counts a surrogate pair as one character', () => {
    expect(maskDraft({ text: 'a😀b', cursor: 3 })).toEqual({ text: '•••', cursor: 2 });
  });
  it('counts a grapheme cluster as one character', () => {
    const family = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}';
    expect(maskDraft({ text: family, cursor: family.length })).toEqual({ text: '•', cursor: 1 });
  });
  it('empty stays empty', () => {
    expect(maskDraft({ text: '', cursor: 0 })).toEqual({ text: '', cursor: 0 });
  });
});

describe('graphemeAt — the cluster the block cursor covers', () => {
  it('reads the whole cluster at a cursor boundary', () => {
    const family = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}';
    expect(graphemeAt(`a${family}`, 1)).toBe(family);
    expect(graphemeAt('abc', 1)).toBe('b');
  });
  it('is empty at the end of the line', () => {
    expect(graphemeAt('abc', 3)).toBe('');
    expect(graphemeAt('', 0)).toBe('');
  });
});
