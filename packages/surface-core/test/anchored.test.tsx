import { PassThrough } from 'node:stream';
import { defaultTheme } from '@mnmal-ai/surface-theme';
import { render as inkRender } from 'ink';
import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import { CLEAR_PANE, createApp, defineModule, type ModuleCtx } from '../src/index.js';
import { echo, panels } from './fixture.js';

// A bottom-anchored pane: the input stays on the last row.

const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms));
type Ctx = ModuleCtx<{ p: Record<string, never> }>;

/** A module that hands the test its ctx, with one panel of its own to open and close. */
function holder() {
  const got: { ctx?: Ctx } = {};
  const mod = defineModule<{ p: Record<string, never> }>('fixture.holder', {
    init: (ctx) => {
      got.ctx = ctx;
      return undefined;
    },
    panels: { p: { view: () => 'THE PANEL' } }
  });
  return { mod, ctx: () => got.ctx as Ctx };
}

/** The app on a terminal: a TTY stdout whose writes are kept, and a TTY stdin. */
function onTerminal(anchored: boolean) {
  const h = holder();
  const out = Object.assign(new PassThrough(), { isTTY: true, columns: 100, rows: 30 });
  const writes: string[] = [];
  out.on('data', (d) => writes.push(String(d)));
  const stdin = Object.assign(new PassThrough(), {
    isTTY: true,
    setRawMode: () => stdin,
    ref: () => stdin,
    unref: () => stdin
  });
  const { App } = createApp({ theme: defaultTheme, modules: [echo, panels, h.mod], anchored });
  const app = inkRender(<App />, {
    stdout: out as unknown as NodeJS.WriteStream,
    stdin: stdin as unknown as NodeJS.ReadStream,
    patchConsole: false,
    exitOnCtrlC: false
  });
  const wipes = () => writes.filter((w) => w.includes(CLEAR_PANE)).length;
  return { ...h, out, wipes, app };
}

describe('a bottom-anchored pane', () => {
  it('a panel closing gives its rows back as a gap, so the input returns to the last row', async () => {
    for (const anchored of [true, false]) {
      const h = holder();
      const { App } = createApp({ theme: defaultTheme, modules: [echo, panels, h.mod], anchored });
      const r = render(<App columns={100} rows={30} />);
      r.stdin.write('/');
      await tick();
      r.stdin.write('\u001B');
      await tick();
      const gaps = h
        .ctx()
        .transcript()
        .committed.filter((e) => e.kind === 'gap');
      if (anchored) {
        expect(gaps).toHaveLength(1);
        expect(gaps[0]).toMatchObject({ kind: 'gap', epoch: 0 });
        expect((gaps[0] as { lines: number }).lines).toBeGreaterThan(0);
      } else {
        expect(gaps).toEqual([]);
      }
      r.unmount();
    }
  });

  it('a panel closing re-lays the pane: wiped, then printed again', async () => {
    const on = onTerminal(true);
    await tick();
    on.ctx().open('p', {});
    await tick();
    const before = on.wipes();
    on.ctx().close();
    await tick();
    expect(on.wipes()).toBe(before + 1);
    on.app.unmount();
  });

  it('a resize re-lays once it settles: wider or narrower and taller, never shorter only', async () => {
    const on = onTerminal(true);
    await tick();
    const start = on.wipes();
    on.out.rows = 20;
    on.out.emit('resize');
    await tick(250);
    expect(on.wipes()).toBe(start);
    on.out.columns = 80;
    on.out.emit('resize');
    on.out.emit('resize');
    await tick(250);
    expect(on.wipes()).toBe(start + 1);
    on.out.rows = 40;
    on.out.emit('resize');
    await tick(250);
    expect(on.wipes()).toBe(start + 2);
    on.app.unmount();
  });

  it('unanchored, nothing is wiped: not on a close, not on a resize', async () => {
    const on = onTerminal(false);
    await tick();
    on.ctx().open('p', {});
    await tick();
    on.ctx().close();
    on.out.columns = 80;
    on.out.emit('resize');
    await tick(250);
    expect(on.wipes()).toBe(0);
    on.app.unmount();
  });

  it('a command chosen from the palette still runs, one render after the palette closes', async () => {
    const h = holder();
    const { App } = createApp({
      theme: defaultTheme,
      modules: [echo, panels, h.mod],
      anchored: true
    });
    const r = render(<App columns={100} rows={30} />);
    r.stdin.write('/hel');
    await tick();
    r.stdin.write('\r');
    await tick();
    expect(
      h
        .ctx()
        .transcript()
        .committed.some((e) => e.kind === 'note' && e.text === 'hello from a command')
    ).toBe(true);
    r.unmount();
  });
});
