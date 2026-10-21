import { defaultTheme } from '@mnmal-ai/surface-theme';
import { render } from 'ink-testing-library';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createApp, defaultPanelRows, defineModule, type Size } from '../src/index.js';
import { echo, panels } from './fixture.js';

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

const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms));
const theme = {
  ...defaultTheme,
  color: { ...defaultTheme.color, surfaceAlt: '#0d0d0d', raised: '#313131' }
};

const sizes = vi.hoisted(() => ({ view: [] as Size[], ctx: [] as Size[] }));
const sized = defineModule<{ probe: Record<string, never> }>('fixture.sized', {
  commands: [
    {
      name: 'probe',
      summary: 'open the probe panel',
      args: [],
      run: (_, ctx) => {
        ctx.open('probe', {});
        sizes.ctx.push(ctx.size());
      }
    }
  ],
  panels: {
    probe: {
      view: ({ size }) => {
        sizes.view.push(size);
        return Array.from({ length: size.rows }, (_, i) => `row ${i}`).join('\n');
      }
    }
  }
});

describe('raised overlays', () => {
  it('the / menu sits on `raised`, not on the band ground', async () => {
    const { App } = createApp({ theme, modules: [echo, panels], band: true });
    const r = render(<App columns={120} rows={40} />);
    await tick();
    seen.boxes.length = 0;
    r.stdin.write('/');
    await tick(60);
    expect(r.lastFrame()).toContain('/hello');
    const menu = seen.boxes.find((b) => b.backgroundColor === '#313131');
    expect(menu).toBeDefined();
    expect(menu?.paddingX).toBe(2);
    expect(menu?.paddingY).toBe(1);
    r.unmount();
  });

  it('an open panel sits on `raised` with a 4-column side inset and a row of padding top and bottom', async () => {
    const { App } = createApp({ theme, modules: [echo, panels], band: true });
    const r = render(<App columns={120} rows={40} />);
    await tick();
    r.stdin.write('/info');
    await tick();
    seen.boxes.length = 0;
    r.stdin.write('\r');
    await tick(60);
    expect(r.lastFrame()).toContain('info count=0');
    const host = seen.boxes.find((b) => b.backgroundColor === '#313131');
    expect(host).toBeDefined();
    expect(host?.paddingX).toBe(4);
    expect(host?.paddingY).toBe(1);
    r.unmount();
  });

  it('a panel is handed its columns and rows less the insets, ctx.size() agrees, and the frame still fits', async () => {
    sizes.view.length = 0;
    sizes.ctx.length = 0;
    const { App } = createApp({ theme, modules: [echo, sized], band: true });
    const r = render(<App columns={120} rows={40} />);
    await tick();
    r.stdin.write('/probe');
    await tick();
    r.stdin.write('\r');
    await tick(60);
    const outer = defaultPanelRows(40, { band: true });
    // 120 − 2×4 columns of side inset; the top and bottom padding rows come out of the budget.
    expect(sizes.view.at(-1)).toEqual({ columns: 112, rows: outer - 2 });
    expect(sizes.ctx.at(-1)).toEqual({ columns: 112, rows: outer - 2 });
    expect((r.lastFrame() ?? '').split('\n').length).toBeLessThanOrEqual(40);
    r.unmount();
  });
});
