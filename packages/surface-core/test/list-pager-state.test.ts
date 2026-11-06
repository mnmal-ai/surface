import type { ListRow, ListSpec } from '@mnmal-ai/surface-kit/list';
import { describe, expect, it } from 'vitest';
import {
  back,
  backspace,
  cursorRow,
  endFilter,
  type ListStep,
  move,
  type PagerState,
  pagerAt,
  placement,
  push,
  scrollDetail,
  startFilter,
  turn,
  typeChar
} from '../src/list-pager-state.js';

const rows = (n: number): ListRow[] =>
  Array.from({ length: n }, (_, i) => ({
    key: `k${i}`,
    name: `row ${i}`,
    details: [i % 2 ? 'odd' : 'even']
  }));
const list = (n: number): ListSpec => ({ heading: 'things', rows: rows(n) });
const top = (s: PagerState) => s.steps[s.steps.length - 1];

describe('moving through a list', () => {
  it('↓ at the last row of a page walks onto the next page', () => {
    let s = pagerAt(list(12), {});
    for (let i = 0; i < 5; i++) s = move(s, 1, 5);
    expect(top(s)).toMatchObject({ page: 1, cursor: 0 });
    expect(cursorRow(s)?.key).toBe('k5');
  });

  it('↑ at the first row of a page walks back onto the previous page', () => {
    const s = move(move(pagerAt(list(12), {}), 1, 5), -1, 5);
    expect(top(move(turn(s, 1, 5), -1, 5))).toMatchObject({ page: 0, cursor: 4 });
  });

  it('stops at the very first and very last row', () => {
    expect(top(move(pagerAt(list(3), {}), -1, 5))).toMatchObject({ page: 0, cursor: 0 });
    let s = pagerAt(list(3), {});
    for (let i = 0; i < 9; i++) s = move(s, 1, 5);
    expect(cursorRow(s)?.key).toBe('k2');
  });

  it('→ turns a page with the cursor on its first row, and stays on the last page', () => {
    const s = turn(turn(turn(pagerAt(list(12), {}), 1, 5), 1, 5), 1, 5);
    expect(top(s)).toMatchObject({ page: 2, cursor: 0 });
  });
});

describe('filtering', () => {
  it('typing narrows the rows and starts again from the first', () => {
    let s = startFilter(turn(pagerAt(list(12), {}), 1, 5));
    s = typeChar(typeChar(typeChar(s, 'o'), 'd'), 'd');
    expect(top(s)).toMatchObject({ filter: 'odd', filtering: true, page: 0, cursor: 0 });
    expect(cursorRow(s)?.key).toBe('k1');
  });

  it("while filtering, 'r' and '/' are typed into the filter", () => {
    const s = typeChar(typeChar(startFilter(pagerAt(list(3), {})), 'r'), '/');
    expect(top(s)).toMatchObject({ filter: 'r/' });
  });

  it('typing does nothing when not filtering', () => {
    const s = typeChar(pagerAt(list(3), {}), 'x');
    expect(top(s)).toMatchObject({ filter: '' });
  });

  it('backspace takes back a character', () => {
    const s = backspace(typeChar(typeChar(startFilter(pagerAt(list(3), {})), 'a'), 'b'));
    expect(top(s)).toMatchObject({ filter: 'a' });
  });

  it('a filter that matches nothing leaves no cursor row', () => {
    const s = typeChar(startFilter(pagerAt(list(3), {})), 'z');
    expect(cursorRow(s)).toBeUndefined();
  });

  it('enter keeps the filter and stops typing into it', () => {
    const s = endFilter(typeChar(startFilter(pagerAt(list(3), {})), 'o'));
    expect(top(s)).toMatchObject({ filter: 'o', filtering: false });
  });
});

describe('Esc steps back', () => {
  it('while filtering: clears the filter', () => {
    const s = back(typeChar(startFilter(pagerAt(list(3), {})), 'o')) as PagerState;
    expect(top(s)).toMatchObject({ filter: '', filtering: false });
  });

  it('from a detail: back to the list at the same page and row', () => {
    const at = move(move(pagerAt(list(12), {}), 1, 5), 1, 5);
    const detail = push(at, {
      kind: 'detail',
      row: rows(1)[0] as ListRow,
      hooks: {},
      detail: 'loading',
      scroll: 0
    });
    const s = back(detail) as PagerState;
    expect(top(s)).toMatchObject({ kind: 'list', page: 0, cursor: 2 });
    expect(s.token).not.toBe(detail.token);
  });

  it('at the list with a kept filter: clears it', () => {
    const s = back(endFilter(typeChar(startFilter(pagerAt(list(3), {})), 'o'))) as PagerState;
    expect(top(s)).toMatchObject({ filter: '' });
  });

  it('at the list with no filter: closes', () => {
    expect(back(pagerAt(list(3), {}))).toBeUndefined();
  });
});

describe('a detail', () => {
  it('scrolls between 0 and the most it can', () => {
    const at = pagerAt(list(1), {});
    let s: PagerState = {
      steps: [
        ...at.steps,
        { kind: 'detail', row: rows(1)[0] as ListRow, hooks: {}, detail: { title: 't' }, scroll: 0 }
      ],
      token: 1
    };
    s = scrollDetail(s, -1, 3);
    expect(top(s)).toMatchObject({ scroll: 0 });
    for (let i = 0; i < 9; i++) s = scrollDetail(s, 1, 3);
    expect(top(s)).toMatchObject({ scroll: 3 });
  });
});

describe('review fixes', () => {
  it('the row shown under the cursor is the one it points at, at any page size', () => {
    let s = pagerAt(list(40), {});
    for (let i = 0; i < 23; i++) s = move(s, 1, 10);
    expect(cursorRow(s)?.key).toBe('k23');
    // The panel shrank: five rows a page now.
    expect(placement(top(s) as ListStep, 5)).toEqual({ page: 4, cursor: 3 });
    s = turn(s, 1, 5);
    expect(cursorRow(s)?.key).toBe('k25');
  });

  it('tokens are never reused, across lists', () => {
    const a = push(pagerAt(list(3), {}), { kind: 'loading-related', row: rows(1)[0] as ListRow });
    const b = push(pagerAt(list(3), {}), { kind: 'loading-related', row: rows(1)[0] as ListRow });
    expect(b.token).not.toBe(a.token);
  });
});
