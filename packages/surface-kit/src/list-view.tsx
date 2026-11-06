import type { Theme } from '@mnmal-ai/surface-theme';
import { Box, Text } from 'ink';
import type { ReactElement } from 'react';
import {
  LIST_GUTTER,
  LIST_INDENT,
  LIST_ORDINAL_GAP,
  LIST_VALUE_GAP,
  type ListLine
} from './list.js';

export interface ListRowsProps {
  /** From `listLines`, at the width this view draws in. */
  readonly lines: readonly ListLine[];
  readonly theme: Theme;
  /** The highlighted row, on the `selection` tone as the palette's is. */
  readonly cursor?: number;
}

/** Laid-out list lines, one terminal line each: dim ordinal, name, dim details, value. */
export function ListRows({ lines, theme, cursor }: ListRowsProps): ReactElement {
  const detailColumn = lines.some((l) => l.detail !== '');
  return (
    <Box flexDirection="column">
      {lines.map((l, i) => (
        <Text
          // biome-ignore lint/suspicious/noArrayIndexKey: lines are positional and never reorder
          key={i}
          wrap="truncate"
          {...(i === cursor ? { backgroundColor: theme.color.selection } : {})}
        >
          {' '.repeat(LIST_INDENT)}
          {l.ordinal !== '' ? (
            <Text color={theme.color.dim}>{l.ordinal + ' '.repeat(LIST_ORDINAL_GAP)}</Text>
          ) : null}
          {l.name.map((s, j) =>
            s.em === true ? (
              // biome-ignore lint/suspicious/noArrayIndexKey: spans are positional
              <Text key={j} bold italic>
                {s.text}
              </Text>
            ) : (
              // biome-ignore lint/suspicious/noArrayIndexKey: spans are positional
              <Text key={j}>{s.text}</Text>
            )
          )}
          {detailColumn ? (
            <Text color={theme.color.dim}>{' '.repeat(LIST_GUTTER) + l.detail}</Text>
          ) : null}
          {l.value !== '' ? <Text>{' '.repeat(LIST_VALUE_GAP) + l.value}</Text> : null}
        </Text>
      ))}
    </Box>
  );
}
