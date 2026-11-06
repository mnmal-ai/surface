// A long list as a reply, and the pager that holds it: one or the other in the transcript, never
// the same rows twice. The app hands `present` a list and the hooks for its rows (open one, find
// related ones); Surface never knows what a row is.

import { ListRows } from '@mnmal-ai/surface-kit';
import {
  type ListRow,
  type ListSpan,
  type ListSpec,
  listLines,
  wrapCells
} from '@mnmal-ai/surface-kit/list';
import type { Theme } from '@mnmal-ai/surface-theme';
import { Box, Text } from 'ink';
import type { ReactElement } from 'react';
import {
  back,
  backspace,
  cursorRow,
  type DetailStep,
  endFilter,
  type ListDetail,
  type ListHooks,
  type ListStep,
  listStep,
  move,
  type PagerState,
  pagerAt,
  placement,
  push,
  type Step,
  scrollDetail,
  startFilter,
  turn,
  typeChar,
  visibleRows
} from './list-pager-state.js';
import { defineModule, type ModuleCtx, type Reply, type Size, type TuiModule } from './module.js';
import { sanitise } from './sanitise.js';

/** A list longer than this is paged rather than printed. */
export const INLINE_LIST_ROWS = 10;
export const LIST_REPLY_KIND = 'surface.list';

type Panels = { pager: PagerState };
interface ListReplyData {
  readonly list: ListSpec;
  readonly paged: boolean;
}

/** Rows a page holds in a panel `rows` tall: the heading, filter and hint lines take the rest. */
export const pageSizeFor = (rows: number): number => Math.max(5, rows - 6);

const cleanSpan = (s: ListSpan): ListSpan =>
  s.em === true ? { text: sanitise(s.text), em: true } : { text: sanitise(s.text) };
const cleanRow = (r: ListRow): ListRow => ({
  key: r.key,
  name: typeof r.name === 'string' ? sanitise(r.name) : r.name.map(cleanSpan),
  ...(r.details ? { details: r.details.map(sanitise) } : {}),
  ...(r.value !== undefined ? { value: sanitise(r.value) } : {})
});
/** Everything an app hands in reaches the terminal sanitised. */
const cleanList = (l: ListSpec): ListSpec => ({
  heading: sanitise(l.heading),
  rows: l.rows.map(cleanRow),
  ...(l.total !== undefined ? { total: l.total } : {}),
  ...(l.notes ? { notes: l.notes.map(sanitise) } : {})
});
const cleanDetail = (d: ListDetail): ListDetail => ({
  title: sanitise(d.title),
  ...(d.meta !== undefined ? { meta: sanitise(d.meta) } : {}),
  ...(d.body !== undefined ? { body: sanitise(d.body) } : {})
});

const inAll = (l: ListSpec) =>
  l.total !== undefined && l.total > l.rows.length ? `, ${l.total} in all` : '';

const isPromise = <T,>(v: T | Promise<T>): v is Promise<T> =>
  typeof (v as { then?: unknown } | null)?.then === 'function';

const errorText = (e: unknown) => sanitise(e instanceof Error ? e.message : String(e));

/** The detail's body lines and the room the panel gives them. */
function detailLayout(d: ListDetail, size: Size) {
  const lines = d.body === undefined ? [] : wrapCells(d.body, size.columns);
  // Title, meta, a blank line, and the hint below.
  const room = Math.max(1, size.rows - (d.meta === undefined ? 3 : 4));
  return { lines, room, maxScroll: Math.max(0, lines.length - room) };
}

function Hint({ theme, parts }: { theme: Theme; parts: readonly string[] }): ReactElement {
  return (
    <Box marginTop={1}>
      <Text color={theme.color.dim} wrap="truncate">
        {parts.join(' · ')}
      </Text>
    </Box>
  );
}

function ListPage({
  step,
  depth,
  theme,
  size
}: {
  step: ListStep;
  depth: number;
  theme: Theme;
  size: Size;
}): ReactElement {
  const shown = visibleRows(step);
  const per = pageSizeFor(size.rows);
  const pages = Math.max(1, Math.ceil(shown.length / per));
  // Placed by the row it points at, so a resize never highlights one row and opens another.
  const at = placement(step, per);
  const page = Math.min(at.page, pages - 1);
  const slice = shown.slice(page * per, page * per + per);
  const total = step.list.total;
  const of =
    total !== undefined && total > step.list.rows.length
      ? ` · ${step.list.rows.length} of ${total}`
      : '';
  const hint = [
    '↑↓ row',
    '←→ page',
    ...(step.hooks.open ? ['enter open'] : []),
    ...(step.hooks.related ? ['r related'] : []),
    '/ filter',
    depth > 1 || step.filter !== '' || step.filtering ? 'esc back' : 'esc close'
  ];
  return (
    <Box flexDirection="column">
      <Text wrap="truncate">
        <Text color={theme.color.accent}>📋 List </Text>
        <Text bold>{step.list.heading}</Text>
        <Text color={theme.color.dim}>{`${of} · page ${page + 1} of ${pages}`}</Text>
      </Text>
      {step.filtering || step.filter !== '' ? (
        <Text color={theme.color.dim} wrap="truncate">
          {`filter: ${step.filter}${step.filtering ? '▌' : ''}`}
        </Text>
      ) : null}
      <Box marginTop={1} flexDirection="column">
        {slice.length === 0 ? (
          <Text color={theme.color.dim} wrap="truncate">
            {step.filter === '' ? 'nothing here' : `no rows match ${step.filter}`}
          </Text>
        ) : (
          <ListRows
            lines={listLines(slice, size.columns, page * per + 1)}
            theme={theme}
            cursor={at.cursor}
          />
        )}
      </Box>
      <Hint theme={theme} parts={hint} />
    </Box>
  );
}

function DetailPage({
  step,
  theme,
  size
}: {
  step: DetailStep;
  theme: Theme;
  size: Size;
}): ReactElement {
  const hint = ['↑↓ scroll', ...(step.hooks.related ? ['r related'] : []), 'esc back'];
  if (step.detail === 'loading' || 'error' in step.detail) {
    return (
      <Box flexDirection="column">
        {step.detail === 'loading' ? (
          <Text color={theme.color.dim}>loading…</Text>
        ) : (
          <Text color={theme.color.warn}>{step.detail.error}</Text>
        )}
        <Hint theme={theme} parts={['esc back']} />
      </Box>
    );
  }
  const d = step.detail;
  const { lines, room } = detailLayout(d, size);
  return (
    <Box flexDirection="column">
      <Text wrap="truncate">
        <Text color={theme.color.accent}>📋 </Text>
        <Text bold>{d.title}</Text>
      </Text>
      {d.meta !== undefined ? (
        <Text color={theme.color.dim} wrap="truncate">
          {d.meta}
        </Text>
      ) : null}
      <Box marginTop={1} flexDirection="column">
        {lines.slice(step.scroll, step.scroll + room).map((l, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: lines are positional
          <Text key={i}>{l}</Text>
        ))}
      </Box>
      <Hint theme={theme} parts={hint} />
    </Box>
  );
}

function PagerView({ state, theme, size }: { state: PagerState; theme: Theme; size: Size }) {
  const step = state.steps[state.steps.length - 1];
  if (step === undefined) return null;
  if (step.kind === 'list') {
    return <ListPage step={step} depth={state.steps.length} theme={theme} size={size} />;
  }
  if (step.kind === 'detail') return <DetailPage step={step} theme={theme} size={size} />;
  return (
    <Box flexDirection="column">
      {step.error === undefined ? (
        <Text color={theme.color.dim}>loading…</Text>
      ) : (
        <Text color={theme.color.warn}>{step.error}</Text>
      )}
      <Hint theme={theme} parts={['esc back']} />
    </Box>
  );
}

function ListReply({
  data,
  theme,
  columns
}: {
  data: ListReplyData;
  theme: Theme;
  columns: number;
}) {
  const { list, paged } = data;
  const n = list.rows.length;
  const width = Math.max(1, columns - 2);
  let tail: string | null = null;
  if (paged) tail = `${n} rows — in the list (/list)${inAll(list)}`;
  else if (n > INLINE_LIST_ROWS)
    tail = `…and ${n - INLINE_LIST_ROWS} more — /list to page through them${inAll(list)}`;
  else if (list.total !== undefined && list.total > n) tail = `… ${list.total} in all`;
  return (
    <Box flexDirection="column">
      <Text bold wrap="wrap">{`${list.heading}:`}</Text>
      {paged ? null : (
        <Box marginTop={1}>
          <ListRows lines={listLines(list.rows.slice(0, INLINE_LIST_ROWS), width)} theme={theme} />
        </Box>
      )}
      {tail !== null ? <Text color={theme.color.dim}>{`  ${tail}`}</Text> : null}
      {(list.notes ?? []).length > 0 ? (
        <Box marginTop={1} flexDirection="column">
          {(list.notes ?? []).map((note, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: two notes may say the same thing
            <Text key={i} color={theme.color.dim} italic wrap="wrap">
              {note}
            </Text>
          ))}
        </Box>
      ) : null}
    </Box>
  );
}

/**
 * The pager module and `present`, which a turn handler yields as its reply:
 * `yield { phase: 'final', reply: pager.present(list, { open, related }) }`. A list of up to
 * `INLINE_LIST_ROWS` prints inline. A longer one opens the pager when no panel is open, and the
 * transcript then carries only its heading and a pointer; otherwise its first rows print inline.
 * `/list` reopens the last long list where it was left.
 */
export function listPager(): {
  module: TuiModule<Panels>;
  present(list: ListSpec, hooks?: ListHooks): Reply;
} {
  let own: ModuleCtx<Panels> | undefined;
  // The last long list, as the operator left its first step: what `/list` reopens.
  let last: PagerState | null = null;

  /**
   * Keeps the first step as the operator left it, and returns the state to show. Only for the
   * list `/list` would reopen: an older list paged while a newer one landed must not take its place.
   */
  const keep = (s: PagerState): PagerState => {
    const first = s.steps[0];
    const was = last?.steps[0];
    if (first?.kind === 'list' && was?.kind === 'list' && first.list === was.list) {
      last = { steps: [first], token: s.token };
    }
    return s;
  };
  const top = (s: PagerState): Step | undefined => s.steps[s.steps.length - 1];
  const replaceTop = (s: PagerState, step: Step): PagerState => ({
    ...s,
    steps: [...s.steps.slice(0, -1), step]
  });
  /** Settles an async step, only while the pager still shows the step it was started for. */
  const settle = (ctx: ModuleCtx<Panels>, token: number, step: (cur: Step) => Step) =>
    ctx.update('pager', (cur) => {
      const t = top(cur);
      return cur.token === token && t !== undefined ? replaceTop(cur, step(t)) : cur;
    });

  const open = (s: PagerState, ctx: ModuleCtx<Panels>): PagerState => {
    const t = top(s);
    if (t?.kind !== 'list') return s;
    if (t.filtering) return keep(endFilter(s));
    const row = cursorRow(s);
    const hook = t.hooks.open;
    if (row === undefined || hook === undefined) return s;
    const base: DetailStep = { kind: 'detail', row, hooks: t.hooks, detail: 'loading', scroll: 0 };
    let got: ListDetail | Promise<ListDetail>;
    try {
      got = hook(row);
    } catch (e) {
      return push(s, { ...base, detail: { error: errorText(e) } });
    }
    if (!isPromise(got)) return push(s, { ...base, detail: cleanDetail(got) });
    const next = push(s, base);
    got.then(
      (d) =>
        settle(ctx, next.token, (cur) =>
          cur.kind === 'detail' ? { ...cur, detail: cleanDetail(d) } : cur
        ),
      (e) =>
        settle(ctx, next.token, (cur) =>
          cur.kind === 'detail' ? { ...cur, detail: { error: errorText(e) } } : cur
        )
    );
    return next;
  };

  const related = (s: PagerState, ctx: ModuleCtx<Panels>): PagerState => {
    const t = top(s);
    if (t?.kind === 'list' && t.filtering) return keep(typeChar(s, 'r'));
    if (t === undefined || t.kind === 'loading-related') return s;
    const row = cursorRow(s);
    const hook = t.hooks.related;
    if (row === undefined || hook === undefined) return s;
    const hooks = t.hooks;
    let got: ListSpec | Promise<ListSpec>;
    try {
      got = hook(row);
    } catch (e) {
      return push(s, { kind: 'loading-related', row, error: errorText(e) });
    }
    if (!isPromise(got)) return push(s, listStep(cleanList(got), hooks));
    const next = push(s, { kind: 'loading-related', row });
    got.then(
      (l) => settle(ctx, next.token, () => listStep(cleanList(l), hooks)),
      (e) => settle(ctx, next.token, () => ({ kind: 'loading-related', row, error: errorText(e) }))
    );
    return next;
  };

  const vertical = (delta: -1 | 1) => (s: PagerState, ctx: ModuleCtx<Panels>) => {
    const t = top(s);
    if (t?.kind === 'detail' && t.detail !== 'loading' && !('error' in t.detail)) {
      return scrollDetail(s, delta, detailLayout(t.detail, ctx.size()).maxScroll);
    }
    return keep(move(s, delta, pageSizeFor(ctx.size().rows)));
  };
  const page = (delta: -1 | 1) => (s: PagerState, ctx: ModuleCtx<Panels>) =>
    keep(turn(s, delta, pageSizeFor(ctx.size().rows)));

  const module = defineModule<Panels>('surface.list', {
    init(ctx) {
      own = ctx;
      return () => {
        own = undefined;
      };
    },
    commands: [
      {
        name: 'list',
        summary: 'page through the last long list',
        args: [],
        run(_args, ctx) {
          if (last === null) {
            ctx.print('nothing to page through');
            return;
          }
          ctx.open('pager', last);
        }
      }
    ],
    renderers: {
      [LIST_REPLY_KIND]: ({ data, theme, size }) => (
        <ListReply data={data as ListReplyData} theme={theme} columns={size.columns} />
      )
    },
    panels: {
      pager: {
        view: ({ state, theme, size }) => <PagerView state={state} theme={theme} size={size} />,
        keymap: [
          { key: 'up', act: 'up' },
          { key: 'down', act: 'down' },
          { key: 'left', act: 'left' },
          { key: 'right', act: 'right' },
          { key: 'enter', act: 'open' },
          { key: 'r', act: 'related' },
          { key: '/', act: 'filter' },
          { key: 'backspace', act: 'backspace' }
        ],
        on: {
          up: vertical(-1),
          down: vertical(1),
          left: page(-1),
          right: page(1),
          open,
          related,
          filter: (s) => {
            const t = top(s);
            return keep(t?.kind === 'list' && t.filtering ? typeChar(s, '/') : startFilter(s));
          },
          backspace: (s) => keep(backspace(s))
        },
        // A pasted chunk joins the filter as one clean line.
        text: (s, text) => keep(typeChar(s, sanitise(text.replace(/[\r\n]+/g, ' ')))),
        escape: (s) => {
          const prev = back(s);
          return prev === undefined ? undefined : keep(prev);
        }
      }
    }
  });

  return {
    module,
    present(list, hooks = {}) {
      const clean = cleanList(list);
      if (clean.rows.length <= INLINE_LIST_ROWS) {
        return { kind: LIST_REPLY_KIND, data: { list: clean, paged: false } };
      }
      last = pagerAt(clean, hooks);
      const paged = own !== undefined && !own.panelOpen();
      if (paged) own?.open('pager', last);
      return { kind: LIST_REPLY_KIND, data: { list: clean, paged } };
    }
  };
}
