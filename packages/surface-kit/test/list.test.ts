import { describe, expect, it } from 'vitest';
import { cellWidth } from '../src/cells.js';
import { filterRows, type ListLine, type ListRow, listLines, wrapCells } from '../src/list.js';

const text = (l: ListLine) => l.name.map((s) => s.text).join('');
/** The line as the view draws it: indent, ordinal, name, detail, value. */
const whole = (l: ListLine) =>
  `  ${l.ordinal}${l.ordinal === '' ? '' : '  '}${text(l)}${l.detail === '' ? '' : `   ${l.detail}`}${l.value === '' ? '' : `  ${l.value}`}`;

describe('listLines', () => {
  it('aligns details down the list', () => {
    const rows: ListRow[] = [
      { key: '1', name: 'a', details: ['one'] },
      { key: '2', name: 'longer', details: ['two'] }
    ];
    const [a, b] = listLines(rows, 60);
    expect(cellWidth(text(a as ListLine))).toBe(cellWidth(text(b as ListLine)));
  });

  it('shortens the longest detail first, keeping the short ones whole', () => {
    const rows: ListRow[] = [
      { key: '1', name: 'Track', details: ['2 days ago', 'a very long album title indeed'] }
    ];
    const [l] = listLines(rows, 40);
    expect(l?.detail).toContain('2 days ago');
    expect(l?.detail.endsWith('…')).toBe(true);
    expect(cellWidth(whole(l as ListLine))).toBeLessThanOrEqual(40);
  });

  it('keeps the columns aligned with wide characters in a name', () => {
    const rows: ListRow[] = [
      { key: '1', name: '日本語', details: ['x'] },
      { key: '2', name: 'abc', details: ['y'] }
    ];
    const [a, b] = listLines(rows, 60);
    expect(cellWidth(text(a as ListLine))).toBe(cellWidth(text(b as ListLine)));
  });

  it('right-aligns ordinals and starts them where told', () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({ key: `${i}`, name: `r${i}` }));
    const lines = listLines(rows, 60);
    expect(lines[0]?.ordinal).toBe(' 1');
    expect(lines[11]?.ordinal).toBe('12');
    expect(listLines(rows.slice(0, 1), 60, 11)[0]?.ordinal).toBe('11');
  });

  it('right-aligns a value column capped at a third of the width, with a dash for none', () => {
    const rows: ListRow[] = [
      { key: '1', name: 'a', value: '$1' },
      { key: '2', name: 'b', value: '$1,000' },
      { key: '3', name: 'c' }
    ];
    const lines = listLines(rows, 30);
    expect(lines[0]?.value).toBe('    $1');
    expect(lines[2]?.value).toBe('     —');
    const long = listLines([{ key: '1', name: 'a', value: 'x'.repeat(40) }], 30);
    expect(cellWidth(long[0]?.value ?? '')).toBeLessThanOrEqual(10);
  });

  it('has no value column when no row has a value', () => {
    expect(listLines([{ key: '1', name: 'a' }], 30)[0]?.value).toBe('');
  });

  it('never wraps: at a width too narrow for name and value, the value shrinks first', () => {
    const rows: ListRow[] = [
      { key: '1', name: 'a fairly long name', details: ['detail'], value: '$1,000,000' }
    ];
    const [l] = listLines(rows, 12);
    expect(cellWidth(whole(l as ListLine))).toBeLessThanOrEqual(12);
    expect(cellWidth(l?.value ?? '')).toBeGreaterThanOrEqual(1);
  });

  it('keeps emphasis spans through fitting', () => {
    const rows: ListRow[] = [
      {
        key: '1',
        name: [
          { text: '"' },
          { text: 'Kid A', em: true },
          { text: '" by ' },
          { text: 'Radiohead', em: true }
        ]
      }
    ];
    const [l] = listLines(rows, 60);
    expect(l?.name.filter((s) => s.em).map((s) => s.text)).toEqual(['Kid A', 'Radiohead']);
  });
});

describe('filterRows', () => {
  const rows: ListRow[] = [
    { key: '1', name: 'Pager remembers its page', details: ['medium', 'tui'] },
    { key: '2', name: 'Clarify chip times out', details: ['high', 'turn'] }
  ];
  it('matches the name, ignoring case', () => {
    expect(filterRows(rows, 'PAGER').map((r) => r.key)).toEqual(['1']);
  });
  it('matches a detail', () => {
    expect(filterRows(rows, 'turn').map((r) => r.key)).toEqual(['2']);
  });
  it('an empty filter keeps every row', () => {
    expect(filterRows(rows, '')).toHaveLength(2);
  });
});

describe('wrapCells', () => {
  it('wraps on spaces within the width', () => {
    expect(wrapCells('one two three four', 9)).toEqual(['one two', 'three', 'four']);
  });
  it('hard-cuts a word longer than the width', () => {
    expect(wrapCells('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij']);
  });
  it('always makes progress, even when a wide character is wider than the width', () => {
    expect(wrapCells('東京', 1)).toEqual(['東', '京']);
  }, 1000);
  it('keeps blank lines between paragraphs', () => {
    expect(wrapCells('a\n\nb', 10)).toEqual(['a', '', 'b']);
  });
});
