import { describe, expect, it } from 'vitest';
import { markdownSpans } from '../src/markdown.js';

const styled = (text: string) =>
  markdownSpans(text)
    .filter((s) => s.style !== undefined)
    .map((s) => `${s.style}:${s.text}`);
const plain = (text: string) =>
  markdownSpans(text)
    .map((s) => s.text)
    .join('');

describe('markdownSpans', () => {
  it('styles the answer the operator saw printed with its asterisks', () => {
    const answer =
      'These traces are stored in a **Substrate** instance. Underneath Substrate is **Postgres** with the **pgvector** extension.';
    expect(styled(answer)).toEqual(['bold:Substrate', 'bold:Postgres', 'bold:pgvector']);
    expect(plain(answer)).toBe(
      'These traces are stored in a Substrate instance. Underneath Substrate is Postgres with the pgvector extension.'
    );
  });

  it('styles italic with either marker, and code', () => {
    expect(styled('It is *not* a fact, it is _a reading_.')).toEqual([
      'italic:not',
      'italic:a reading'
    ]);
    expect(styled('Run `app sweep` hourly.')).toEqual(['code:app sweep']);
    expect(styled('__also bold__')).toEqual(['bold:also bold']);
  });

  it('leaves everything that is not unambiguously markup exactly as written', () => {
    for (const t of [
      '5 * 3 = 15, and 2 * 4 = 8',
      'the table is alpha_prime_v3',
      'snake_case_name and another_one',
      'Tool released Ænima* in 1996',
      'a lone ** in the middle',
      '* not an opener',
      'an unclosed `backtick'
    ]) {
      expect(
        markdownSpans(t).every((s) => s.style === undefined),
        t
      ).toBe(true);
      expect(plain(t), t).toBe(t);
    }
  });

  it('never styles across a line break', () => {
    expect(styled('a *stray marker\nand the rest* of the answer')).toEqual([]);
  });

  it('keeps line breaks in the plain text, which Ink renders as they are', () => {
    expect(plain('First paragraph.\n\nSecond, with **bold**.')).toBe(
      'First paragraph.\n\nSecond, with bold.'
    );
  });

  it('treats what is inside code as literal', () => {
    expect(styled('`**not bold**`')).toEqual(['code:**not bold**']);
  });
});
