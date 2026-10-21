import { defaultTheme } from '@mnmal-ai/surface-theme';
import { Text } from 'ink';
import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import { cellWidth } from '../src/cells.js';
import { Panel } from '../src/panel.js';

describe('Panel', () => {
  it('draws a titled, bordered box with the title glyph in upper case', () => {
    const { lastFrame } = render(
      <Panel title="metrics" theme={defaultTheme} width={30}>
        <Text>rps 12</Text>
      </Panel>
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('■ METRICS');
    expect(frame).toContain('rps 12');
    expect(frame).toMatch(/[┌─┐]/);
  });

  it('truncates a wide-character title by terminal cells so every line is exactly the panel width', () => {
    const { lastFrame } = render(
      <Panel title="観測データの概要と詳細" theme={defaultTheme} width={16}>
        <Text>x</Text>
      </Panel>
    );
    // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI escapes
    const lines = (lastFrame() ?? '').replace(/\u001b\[[0-9;]*m/g, '').split('\n');
    expect(lines.some((l) => l.includes('…'))).toBe(true);
    for (const l of lines) expect(cellWidth(l)).toBe(16);
  });
});
