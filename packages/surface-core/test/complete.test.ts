import { describe, expect, it } from 'vitest';
import { applySuggestion, mergeCompletions } from '../src/complete.js';

describe('mergeCompletions', () => {
  it('merges, dedupes by insert, and ranks by score then label', async () => {
    const out = await mergeCompletions(
      [
        {
          id: 'a',
          complete: () => [
            { label: 'beta', insert: 'beta', score: 1 },
            { label: 'alpha', insert: 'alpha', score: 1 }
          ]
        },
        {
          id: 'b',
          complete: async () => [
            { label: 'alpha (dup)', insert: 'alpha' },
            { label: 'gamma', insert: 'gamma', score: 5 }
          ]
        }
      ],
      'x',
      1
    );
    expect(out.map((s) => s.insert)).toEqual(['gamma', 'alpha', 'beta']);
  });

  it('keeps the higher-scored suggestion when inserts collide', async () => {
    const out = await mergeCompletions(
      [
        { id: 'a', complete: () => [{ label: 'low', insert: 'x', score: 1 }] },
        { id: 'b', complete: () => [{ label: 'high', insert: 'x', score: 3 }] }
      ],
      '',
      0
    );
    expect(out.map((s) => s.label)).toEqual(['high']);
  });

  it('drops a completer that hangs past its timeout, and one that rejects', async () => {
    const out = await mergeCompletions(
      [
        { id: 'slow', complete: () => new Promise(() => {}) },
        {
          id: 'bad',
          complete: async () => {
            throw new Error('boom');
          }
        },
        {
          id: 'sync-bad',
          complete: () => {
            throw new Error('boom');
          }
        },
        { id: 'ok', complete: () => [{ label: 'kept', insert: 'kept' }] }
      ],
      'k',
      1,
      { timeoutMs: 20 }
    );
    expect(out.map((s) => s.insert)).toEqual(['kept']);
  });

  it('caps the list', async () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ label: `s${i}`, insert: `s${i}` }));
    const out = await mergeCompletions([{ id: 'm', complete: () => many }], '', 0, { limit: 8 });
    expect(out).toHaveLength(8);
  });
});

describe('applySuggestion', () => {
  it('replaces the token under the cursor', () => {
    expect(
      applySuggestion('todos status:op', 15, { label: 'open', insert: 'status:open' })
    ).toEqual({
      text: 'todos status:open',
      cursor: 17
    });
    expect(applySuggestion('to', 2, { label: 'todos', insert: 'todos' })).toEqual({
      text: 'todos',
      cursor: 5
    });
  });

  it('without a span keeps the token tail after the cursor, as a shell does', () => {
    expect(applySuggestion('status:opp', 9, { label: 'open', insert: 'status:open' })).toEqual({
      text: 'status:openp',
      cursor: 11
    });
  });

  it('replaces a span that ends after the cursor', () => {
    expect(
      applySuggestion('status:opp', 9, { label: 'open', insert: 'status:open', replace: [0, 10] })
    ).toEqual({ text: 'status:open', cursor: 11 });
    expect(
      applySuggestion('todos st x', 8, { label: 'status:', insert: 'status:', replace: [6, 8] })
    ).toEqual({ text: 'todos status: x', cursor: 13 });
  });

  it('ignores an invalid span and completes the token', () => {
    for (const replace of [
      [5, 2],
      [-1, 3],
      [0, 99],
      [0.5, 2]
    ] as const) {
      expect(applySuggestion('to', 2, { label: 'todos', insert: 'todos', replace })).toEqual({
        text: 'todos',
        cursor: 5
      });
    }
  });
});

describe('mergeCompletions with spans', () => {
  it('keeps one insert offered over two different spans', async () => {
    const got = await mergeCompletions(
      [
        { id: 'c2', complete: () => [{ label: 'a', insert: 'open', replace: [0, 2] as const }] },
        { id: 'c4', complete: () => [{ label: 'a', insert: 'open', replace: [0, 4] as const }] }
      ],
      'op x',
      2
    );
    expect(got.map((s) => s.replace)).toEqual([
      [0, 2],
      [0, 4]
    ]);
  });
});
