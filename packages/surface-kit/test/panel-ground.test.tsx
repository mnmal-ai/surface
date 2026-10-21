import { defaultTheme } from '@mnmal-ai/surface-theme';
import { render } from 'ink-testing-library';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Panel } from '../src/panel.js';

const seen = vi.hoisted(() => ({ boxes: [] as Record<string, unknown>[] }));

vi.mock('ink', async (orig) => {
  const actual = await orig<typeof import('ink')>();
  return {
    ...actual,
    Box: (props: Record<string, unknown>) => {
      seen.boxes.push(props);
      return createElement(actual.Box, props);
    }
  };
});

const theme = { ...defaultTheme, color: { ...defaultTheme.color, raised: '#313131' } };
const bordered = () => seen.boxes.find((b) => b.borderStyle !== undefined);

describe('Panel ground', () => {
  it('draws its border on the overlay ground, so no stripe of terminal background shows', () => {
    seen.boxes.length = 0;
    render(<Panel title="service" theme={theme} width={30} />);
    expect(bordered()?.borderBackgroundColor).toBe('#313131');
  });

  it('a Panel outside an overlay can name its own ground', () => {
    seen.boxes.length = 0;
    render(<Panel title="service" theme={theme} width={30} ground="#000000" />);
    expect(bordered()?.borderBackgroundColor).toBe('#000000');
  });
});
