import { defaultTheme } from '@mnmal-ai/surface-theme';
import { render } from 'ink-testing-library';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { listLines } from '../src/list.js';
import { ListRows } from '../src/list-view.js';

const seen = vi.hoisted(() => ({ texts: [] as Record<string, unknown>[] }));

vi.mock('ink', async (orig) => {
  const actual = await orig<typeof import('ink')>();
  return {
    ...actual,
    Text: (props: Record<string, unknown>) => {
      seen.texts.push(props);
      return createElement(actual.Text, props);
    }
  };
});

const lines = listLines(
  [
    { key: '1', name: 'first', details: ['a'] },
    { key: '2', name: [{ text: 'Kid A', em: true }], details: ['b'] },
    { key: '3', name: 'third', details: ['c'], value: '$3' }
  ],
  50
);

describe('ListRows', () => {
  it('draws every row, one line each', () => {
    const { lastFrame } = render(<ListRows lines={lines} theme={defaultTheme} />);
    const frame = lastFrame() ?? '';
    expect(frame.split('\n')).toHaveLength(3);
    for (const n of ['first', 'Kid A', 'third', '$3']) expect(frame).toContain(n);
  });

  it('marks the cursor row with the selection colour, and only that row', () => {
    seen.texts.length = 0;
    render(<ListRows lines={lines} theme={defaultTheme} cursor={1} />);
    const marked = seen.texts.filter((t) => t.backgroundColor === defaultTheme.color.selection);
    expect(marked).toHaveLength(1);
  });

  it('draws an emphasised span bold and italic, and the ordinal and detail dim', () => {
    seen.texts.length = 0;
    render(<ListRows lines={lines} theme={defaultTheme} />);
    expect(
      seen.texts.some((t) => t.bold === true && t.italic === true && t.children === 'Kid A')
    ).toBe(true);
    expect(seen.texts.filter((t) => t.color === defaultTheme.color.dim).length).toBeGreaterThan(0);
  });
});
