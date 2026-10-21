import type { Theme, Tone } from '@mnmal-ai/surface-theme';
import { Box, Text } from 'ink';
import type { ReactNode } from 'react';
import { truncateCells } from './cells.js';

export interface PanelProps {
  readonly title: string;
  readonly theme: Theme;
  readonly tone?: Tone;
  /** Outer width in columns, border included. */
  readonly width?: number;
  /**
   * The background its border is drawn on. Ink paints borders on no background unless told, so a
   * Panel inside an overlay showed a stripe of the terminal's own ground on every border row and
   * down each side. Defaults to `theme.color.raised`, the overlay ground every Panel sits on today.
   */
  readonly ground?: string;
  readonly children?: ReactNode;
}

/** The panel anatomy: a single-line border in the panel's tone and an upper-case title line led by `theme.glyph.title`. */
export function Panel({ title, theme, tone = 'accent', width, ground, children }: PanelProps) {
  const label = `${theme.glyph.title} ${title.toUpperCase()}`;
  // Border (2) + paddingX (2) leave width - 4 cells for the title.
  const shown = width === undefined ? label : truncateCells(label, Math.max(1, width - 4));
  return (
    <Box
      borderStyle="single"
      borderColor={theme.color[tone]}
      borderBackgroundColor={ground ?? theme.color.raised}
      paddingX={1}
      flexDirection="column"
      {...(width === undefined ? {} : { width })}
    >
      <Text bold color={theme.color[tone]}>
        {shown}
      </Text>
      {children}
    </Box>
  );
}
