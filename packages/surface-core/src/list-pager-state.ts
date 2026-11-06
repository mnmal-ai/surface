// The list pager as data: a stack of steps (the list, a row opened in full, a related list), each
// moved by pure functions so paging, filtering and the Esc ladder are tested without rendering.

import { filterRows, type ListRow, type ListSpec } from '@mnmal-ai/surface-kit/list';

/** One row in full, as an app's `open` hook describes it. */
export interface ListDetail {
  readonly title: string;
  /** A dim line under the title: status, area, when. */
  readonly meta?: string;
  /** Wrapped to the panel's width and scrolled with ↑↓. */
  readonly body?: string;
}

/** What the app does with a row. Either may be left out, and its key then does nothing. */
export interface ListHooks {
  readonly open?: (row: ListRow) => ListDetail | Promise<ListDetail>;
  readonly related?: (row: ListRow) => ListSpec | Promise<ListSpec>;
}

export interface ListStep {
  readonly kind: 'list';
  readonly list: ListSpec;
  readonly hooks: ListHooks;
  readonly page: number;
  readonly cursor: number;
  readonly filter: string;
  readonly filtering: boolean;
  /** The page size it was last moved with: `page` and `cursor` are measured in it. */
  readonly size: number;
}
export interface DetailStep {
  readonly kind: 'detail';
  readonly row: ListRow;
  readonly hooks: ListHooks;
  readonly detail: ListDetail | 'loading' | { readonly error: string };
  readonly scroll: number;
}
export interface RelatedLoadingStep {
  readonly kind: 'loading-related';
  readonly row: ListRow;
  /** Set when the related list could not be found. */
  readonly error?: string;
}
export type Step = ListStep | DetailStep | RelatedLoadingStep;

export interface PagerState {
  readonly steps: readonly Step[];
  /** Bumped on every push and pop, so an async result can tell the step it was for is gone. */
  readonly token: number;
}

export const listStep = (list: ListSpec, hooks: ListHooks): ListStep => ({
  kind: 'list',
  list,
  hooks,
  page: 0,
  cursor: 0,
  filter: '',
  filtering: false,
  size: 1
});

// One counter for every pager, so a token is never reused: a slow result started on one list can
// never land on another.
let tokens = 0;
const fresh = (): number => {
  tokens += 1;
  return tokens;
};

export const pagerAt = (list: ListSpec, hooks: ListHooks): PagerState => ({
  steps: [listStep(list, hooks)],
  token: fresh()
});

const top = (s: PagerState): Step | undefined => s.steps[s.steps.length - 1];
const withTop = (s: PagerState, step: Step): PagerState => ({
  ...s,
  steps: [...s.steps.slice(0, -1), step]
});
const onList = (s: PagerState, fn: (l: ListStep) => ListStep): PagerState => {
  const t = top(s);
  return t?.kind === 'list' ? withTop(s, fn(t)) : s;
};

export const push = (s: PagerState, step: Step): PagerState => ({
  steps: [...s.steps, step],
  token: fresh()
});

/** Where the cursor's row falls at page size `per`, whatever size it was last moved with. */
export function placement(l: ListStep, per: number): { page: number; cursor: number } {
  const at = l.page * l.size + l.cursor;
  return { page: Math.floor(at / per), cursor: at % per };
}

/** The list's rows as the filter leaves them. */
export const visibleRows = (l: ListStep): ListRow[] => filterRows(l.list.rows, l.filter);

/** The highlighted row, or the open detail's row; undefined when the filter matches nothing. */
export function cursorRow(s: PagerState): ListRow | undefined {
  const t = top(s);
  if (t === undefined) return undefined;
  if (t.kind !== 'list') return t.row;
  return visibleRows(t)[t.page * t.size + t.cursor];
}

/** ↑↓: one row, walking onto the next or previous page at an edge; stops at either end. */
export function move(s: PagerState, delta: -1 | 1, pageSize: number): PagerState {
  return onList(s, (l) => {
    const n = visibleRows(l).length;
    if (n === 0) return { ...l, size: pageSize };
    // The row index in the size it was last moved with, re-measured in this one.
    const at = Math.min(Math.max(0, l.page * l.size + l.cursor + delta), n - 1);
    return { ...l, page: Math.floor(at / pageSize), cursor: at % pageSize, size: pageSize };
  });
}

/** ←→: a page, the cursor on its first row; stays on the first or last page. */
export function turn(s: PagerState, delta: -1 | 1, pageSize: number): PagerState {
  return onList(s, (l) => {
    const pages = Math.max(1, Math.ceil(visibleRows(l).length / pageSize));
    const { page } = placement(l, pageSize);
    return {
      ...l,
      page: Math.min(Math.max(0, page + delta), pages - 1),
      cursor: 0,
      size: pageSize
    };
  });
}

export const startFilter = (s: PagerState): PagerState =>
  onList(s, (l) => ({ ...l, filtering: true }));

/** While filtering: the character joins the filter, and the list starts again from its top. */
export const typeChar = (s: PagerState, ch: string): PagerState =>
  onList(s, (l) => (l.filtering ? { ...l, filter: l.filter + ch, page: 0, cursor: 0 } : l));

export const backspace = (s: PagerState): PagerState =>
  onList(s, (l) =>
    l.filtering ? { ...l, filter: [...l.filter].slice(0, -1).join(''), page: 0, cursor: 0 } : l
  );

/** Enter while filtering: keep the filter, stop typing into it. */
export const endFilter = (s: PagerState): PagerState =>
  onList(s, (l) => ({ ...l, filtering: false }));

/**
 * Esc: filtering → the filter cleared; a detail or a related list → the step before it, where it
 * was left; the first list with a filter kept → the filter cleared; otherwise undefined (close).
 */
export function back(s: PagerState): PagerState | undefined {
  const t = top(s);
  if (t === undefined) return undefined;
  if (t.kind === 'list' && (t.filtering || t.filter !== '')) {
    return withTop(s, { ...t, filter: '', filtering: false, page: 0, cursor: 0 });
  }
  if (s.steps.length > 1) return { steps: s.steps.slice(0, -1), token: fresh() };
  return undefined;
}

/** ↑↓ on a detail: scroll between 0 and `maxScroll`. */
export function scrollDetail(s: PagerState, delta: -1 | 1, maxScroll: number): PagerState {
  const t = top(s);
  if (t?.kind !== 'detail') return s;
  return withTop(s, {
    ...t,
    scroll: Math.min(Math.max(0, t.scroll + delta), Math.max(0, maxScroll))
  });
}
