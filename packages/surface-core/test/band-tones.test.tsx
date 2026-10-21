import { defaultTheme } from '@mnmal-ai/surface-theme';
import { render } from 'ink-testing-library';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/index.js';
import { echo, panels } from './fixture.js';

const seen = vi.hoisted(() => ({ boxes: [] as Record<string, unknown>[], texts: [] as unknown[] }));

vi.mock('ink', async (orig) => {
  const actual = await orig<typeof import('ink')>();
  return {
    ...actual,
    Box: (props: Record<string, unknown>) => {
      seen.boxes.push(props);
      return createElement(actual.Box, props);
    },
    Text: (props: Record<string, unknown>) => {
      seen.texts.push(props.color);
      return createElement(actual.Text, props);
    }
  };
});

describe('band tones', () => {
  it('the band edge uses `edge` and the cursor uses `cursor`, never accent', async () => {
    const theme = {
      ...defaultTheme,
      color: { ...defaultTheme.color, accent: '#111111', edge: '#aa0000', cursor: '#00aa00' }
    };
    const { App } = createApp({ theme, modules: [echo], band: true });
    const r = render(<App columns={120} />);
    await new Promise((res) => setTimeout(res, 30));
    const band = seen.boxes.find((b) => b.borderStyle === 'bold');
    expect(band?.borderColor).toBe('#aa0000');
    expect(seen.texts).toContain('#00aa00');
    r.unmount();
  });

  it('the palette selection uses `selection`, not the edge', async () => {
    seen.boxes.length = 0;
    const theme = {
      ...defaultTheme,
      color: { ...defaultTheme.color, edge: '#aa0000', selection: '#0000aa' }
    };
    const { App } = createApp({ theme, modules: [echo, panels], band: true });
    const r = render(<App columns={120} />);
    await new Promise((res) => setTimeout(res, 30));
    seen.boxes.length = 0;
    r.stdin.write('/');
    await new Promise((res) => setTimeout(res, 60));
    expect(r.lastFrame()).toContain('/hello');
    const grounds = seen.boxes.map((b) => b.backgroundColor);
    expect(grounds).toContain('#0000aa');
    expect(seen.boxes.some((b) => b.backgroundColor === '#aa0000')).toBe(false);
    r.unmount();
  });
});
