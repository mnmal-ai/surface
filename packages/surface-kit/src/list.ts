// A list laid out as lines of text, pure so it is tested as data: Coda's one-line rows (a dim
// ordinal, the name, dim details beside it, aligned down the list) and a right-aligned value column.
// Nothing wraps: a wrapped row breaks the column the reader is scanning.

import { cellWidth, cutToWidth, padCells, truncateCells } from './cells.js';

export interface ListSpan {
  readonly text: string;
  readonly em?: boolean;
}

export interface ListRow {
  /** Stable identity, for the app's hooks; never shown. */
  readonly key: string;
  /** What the row is: plain text, or spans with emphasised parts (`"*Kid A*" by *Radiohead*`). */
  readonly name: string | readonly ListSpan[];
  /** Quieter facts beside the name, joined with ` · `. */
  readonly details?: readonly string[];
  /** One figure per row (money, a count, a score), right-aligned in its own column. */
  readonly value?: string;
}

export interface ListSpec {
  readonly heading: string;
  readonly rows: readonly ListRow[];
  /** All matches, when the rows are only some of them. */
  readonly total?: number;
  /** Asides drawn after the rows. */
  readonly notes?: readonly string[];
}

export interface ListLine {
  /** Right-aligned to the widest ordinal. */
  readonly ordinal: string;
  /** Fitted, and padded to the shared name width when a detail or value column follows. */
  readonly name: readonly ListSpan[];
  /** ` · `-joined details, fitted; padded to the detail column when a value column follows. */
  readonly detail: string;
  /** Right-aligned to the value column; '' when no row has a value. */
  readonly value: string;
}

/** The gaps the view draws: before the ordinal, after it, before the details, before the value. */
export const LIST_INDENT = 2;
export const LIST_ORDINAL_GAP = 2;
export const LIST_GUTTER = 3;
export const LIST_VALUE_GAP = 2;

/** The narrowest a shortened detail cell is cut to: below this an ellipsis says nothing. */
const MIN_CELL = 8;
/** A detail column is not squeezed below this while the name can give way. */
const MIN_DETAIL = 16;
/** A name is not cut below this while a value column can give way. */
const MIN_NAME = 8;
const DETAIL_SEP = ' · ';
const EMPTY = '—';

const spansOf = (name: ListRow['name']): readonly ListSpan[] =>
  typeof name === 'string' ? [{ text: name }] : name;
const spanText = (spans: readonly ListSpan[]): string => spans.map((s) => s.text).join('');
const detailsOf = (r: ListRow): string[] => (r.details ?? []).filter((d) => d !== '');

/** Spans cut to `max` cells, ending in `…` when anything was cut. */
function fitSpans(spans: readonly ListSpan[], max: number): ListSpan[] {
  if (cellWidth(spanText(spans)) <= max) return [...spans];
  if (max <= 1) return [{ text: cutToWidth(spanText(spans), Math.max(0, max)) }];
  const out: ListSpan[] = [];
  let left = max - 1;
  for (const s of spans) {
    if (left <= 0) break;
    const t = cutToWidth(s.text, left);
    out.push(s.em === true ? { text: t, em: true } : { text: t });
    left -= cellWidth(t);
  }
  out.push({ text: '…' });
  return out;
}

/** Details fitted into `room` by shortening the longest cell first, so short facts survive. */
function fitCells(cells: readonly string[], room: number): string {
  const out = [...cells];
  const length = () => cellWidth(out.join(DETAIL_SEP));
  while (length() > room) {
    let longest = -1;
    for (const [i, c] of out.entries()) {
      if (
        cellWidth(c) > MIN_CELL &&
        (longest < 0 || cellWidth(c) > cellWidth(out[longest] ?? ''))
      ) {
        longest = i;
      }
    }
    if (longest < 0) return truncateCells(out.join(DETAIL_SEP), room);
    const c = out[longest] ?? '';
    out[longest] = truncateCells(c, Math.max(MIN_CELL, cellWidth(c) - (length() - room)));
  }
  return out.join(DETAIL_SEP);
}

/** One line per row in `width` cells, numbered from `firstOrdinal`. */
export function listLines(rows: readonly ListRow[], width: number, firstOrdinal = 1): ListLine[] {
  const ordinals = rows.map((_, i) => String(firstOrdinal + i));
  const ordW = Math.max(0, ...ordinals.map((o) => o.length));
  const names = rows.map((r) => spansOf(r.name));
  const details = rows.map(detailsOf);
  const hasValue = rows.some((r) => r.value !== undefined && r.value !== '');
  const values = rows.map((r) => (r.value === undefined || r.value === '' ? EMPTY : r.value));

  const avail0 = width - LIST_INDENT - (ordW > 0 ? ordW + LIST_ORDINAL_GAP : 0);
  // The value column gives way before the name does.
  const valW = hasValue
    ? Math.max(
        1,
        Math.min(
          Math.max(...values.map(cellWidth)),
          Math.floor(width / 3),
          avail0 - LIST_VALUE_GAP - MIN_NAME
        )
      )
    : 0;
  const avail = avail0 - (hasValue ? valW + LIST_VALUE_GAP : 0);
  const detailWidth = Math.max(0, ...details.map((d) => cellWidth(d.join(DETAIL_SEP))));
  const nameNatural = Math.max(0, ...names.map((n) => cellWidth(spanText(n))));
  const detailFloor = detailWidth > 0 ? LIST_GUTTER + Math.min(detailWidth, MIN_DETAIL) : 0;
  const nameWidth = Math.max(
    1,
    Math.min(MIN_NAME, avail),
    Math.min(nameNatural, avail - detailFloor)
  );
  const detailRoom = Math.max(0, avail - nameWidth - (detailWidth > 0 ? LIST_GUTTER : 0));
  const padName = detailWidth > 0 || hasValue;

  return rows.map((_, i) => {
    const fitted = fitSpans(names[i] ?? [], nameWidth);
    const pad = padName ? nameWidth - cellWidth(spanText(fitted)) : 0;
    const name = pad > 0 ? [...fitted, { text: ' '.repeat(pad) }] : fitted;
    const cells = details[i] ?? [];
    const fit = cells.length === 0 || detailRoom === 0 ? '' : fitCells(cells, detailRoom);
    const detail = hasValue && detailRoom > 0 && detailWidth > 0 ? padCells(fit, detailRoom) : fit;
    return {
      ordinal: ordinals[i]?.padStart(ordW) ?? '',
      name,
      detail,
      value: hasValue ? padCells(truncateCells(values[i] ?? EMPTY, valW), valW, true) : ''
    };
  });
}

/** Rows whose name or details contain `filter`, ignoring case. An empty filter keeps them all. */
export function filterRows(rows: readonly ListRow[], filter: string): ListRow[] {
  const f = filter.toLowerCase();
  if (f === '') return [...rows];
  return rows.filter((r) =>
    `${spanText(spansOf(r.name))} ${detailsOf(r).join(' ')}`.toLowerCase().includes(f)
  );
}

/** `text` wrapped to `width` cells on spaces; a word longer than the width is cut. */
export function wrapCells(text: string, width: number): string[] {
  const w = Math.max(1, width);
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (let word of para.split(' ').filter((x) => x !== '')) {
      while (cellWidth(word) > w) {
        if (line !== '') {
          out.push(line);
          line = '';
        }
        const head = cutToWidth(word, w);
        out.push(head);
        word = word.slice(head.length);
      }
      const next = line === '' ? word : `${line} ${word}`;
      if (cellWidth(next) <= w) line = next;
      else {
        out.push(line);
        line = word;
      }
    }
    out.push(line);
  }
  return out;
}
