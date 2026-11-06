import { EventEmitter } from 'node:events';
import { defaultTheme } from '@mnmal-ai/surface-theme';
import { render as inkRender } from 'ink';
import { render } from 'ink-testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp, defineModule, type ModuleCtx } from '../src/index.js';
import { echo } from './fixture.js';

// Full-screen: the transcript scrolls in a viewport; the input stays on the last rows.

const ENTER = '\r';
const PG_UP = '\x1b[5~';
const PG_DN = '\x1b[6~';
const END = '\x1b[F';
const HOME = '\x1b[H';
const UP = '\x1b[A';
const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms));

/** ink-testing-library's harness, on a TTY: full frames (debug), and the size the app is told. */
class Out extends EventEmitter {
  readonly isTTY = true;
  frames: string[] = [];
  constructor(
    readonly columns: number,
    readonly rows: number
  ) {
    super();
  }
  write = (frame: string) => {
    this.frames.push(frame);
  };
  lastFrame = () => this.frames.at(-1) ?? '';
}
class In extends EventEmitter {
  readonly isTTY = true;
  data: string | null = null;
  write = (data: string) => {
    this.data = data;
    this.emit('readable');
    this.emit('data', data);
  };
  read = () => {
    const d = this.data;
    this.data = null;
    return d;
  };
  setEncoding() {}
  setRawMode() {}
  resume() {}
  pause() {}
  ref() {}
  unref() {}
}

type Ctx = ModuleCtx<Record<string, never>>;
function holder() {
  const got: { ctx?: Ctx } = {};
  const mod = defineModule('fixture.fs-holder', {
    init: (ctx) => {
      got.ctx = ctx as Ctx;
      return undefined;
    }
  });
  return { mod, ctx: () => got.ctx as Ctx };
}

const unmounts: (() => void)[] = [];
afterEach(() => {
  for (const u of unmounts.splice(0)) u();
  delete process.env.SURFACE_FULLSCREEN;
});

function onTerminal(opts: { rows?: number; columns?: number; band?: boolean } = {}) {
  const h = holder();
  const rows = opts.rows ?? 12;
  const columns = opts.columns ?? 60;
  const out = new Out(columns, rows);
  const stdin = new In();
  const { App } = createApp({
    theme: defaultTheme,
    modules: [echo, h.mod],
    ...(opts.band ? { band: true } : {})
  });
  const app = inkRender(<App columns={columns} rows={rows} />, {
    stdout: out as unknown as NodeJS.WriteStream,
    stdin: stdin as unknown as NodeJS.ReadStream,
    debug: true,
    patchConsole: false,
    exitOnCtrlC: false
  });
  unmounts.push(() => app.unmount());
  const lines = () => out.lastFrame().split('\n');
  const type = async (s: string) => {
    stdin.write(s);
    await tick();
  };
  return { ...h, out, lines, type, frame: () => out.lastFrame() };
}

/** Prints `n` numbered notes, one line each. */
async function fill(t: ReturnType<typeof onTerminal>, n: number, from = 1) {
  for (let i = from; i < from + n; i++) t.ctx().print(`line ${i}`);
  await tick();
}

describe('full-screen', () => {
  it('the input stays on the last rows while the transcript scrolls under it', async () => {
    const t = onTerminal();
    await fill(t, 30);
    await t.type('draft');
    const ls = t.lines();
    expect(ls.length).toBeLessThanOrEqual(12);
    expect(ls.findIndex((l) => l.includes('draft'))).toBeGreaterThan(ls.length - 4);
    expect(t.frame()).toContain('line 30');
    expect(t.frame()).not.toContain('line 1\n');
  });

  it('PgUp holds the view and shows the marker; new output does not move it; End jumps back', async () => {
    const t = onTerminal();
    await fill(t, 30);
    await t.type(PG_UP);
    expect(t.frame()).not.toContain('line 30');
    expect(t.frame()).toMatch(/↓ \d+ lines below · End to jump back/);
    const held = t.lines().filter((l) => l.startsWith('line'));
    const before = Number(/↓ (\d+)/.exec(t.frame())?.[1]);
    await fill(t, 3, 31);
    expect(t.lines().filter((l) => l.startsWith('line'))).toEqual(held);
    expect(Number(/↓ (\d+)/.exec(t.frame())?.[1])).toBe(before + 3);
    await t.type(END);
    expect(t.frame()).not.toContain('lines below');
    expect(t.frame()).toContain('line 33');
  });

  it('PgUp pressed as output lands still scrolls', async () => {
    const t = onTerminal();
    for (let i = 1; i <= 30; i++) t.ctx().print(`line ${i}`);
    await new Promise((r) => setImmediate(r));
    await t.type(PG_UP);
    expect(t.frame()).toContain('lines below');
  });

  it('PgDn back to the bottom follows again', async () => {
    const t = onTerminal();
    await fill(t, 30);
    await t.type(PG_UP);
    expect(t.frame()).toContain('lines below');
    await t.type(PG_DN);
    expect(t.frame()).not.toContain('lines below');
    await fill(t, 1, 31);
    expect(t.frame()).toContain('line 31');
  });

  it('submitting while held snaps to the bottom', async () => {
    const t = onTerminal();
    await fill(t, 30);
    await t.type(PG_UP);
    expect(t.frame()).toContain('lines below');
    await t.type('hello');
    await t.type(ENTER);
    expect(t.frame()).not.toContain('lines below');
    expect(t.frame()).toContain('echo: hello');
  });

  it('End while following moves the cursor to the end of the line', async () => {
    const t = onTerminal();
    await t.type('abc');
    await t.type(HOME);
    await t.type(END);
    await t.type('d');
    expect(t.frame()).toContain('abcd');
  });

  it('Up still recalls history in full-screen', async () => {
    const t = onTerminal();
    await t.type('first');
    await t.type(ENTER);
    await t.type(UP);
    const input = t.lines().filter((l) => l.includes('first'));
    expect(input.length).toBeGreaterThan(1);
  });

  it('an invalid SURFACE_FULLSCREEN prints one warning note and keeps the default', async () => {
    process.env.SURFACE_FULLSCREEN = 'yes';
    const t = onTerminal();
    await tick();
    expect(t.frame()).toContain('SURFACE_FULLSCREEN=yes ignored: use on or off');
    expect(t.frame().split('SURFACE_FULLSCREEN=yes').length).toBe(2);
    expect(t.frame()).not.toContain('lines below');
  });

  it('SURFACE_FULLSCREEN=off keeps the inline layout on a TTY', async () => {
    process.env.SURFACE_FULLSCREEN = 'off';
    const t = onTerminal();
    await fill(t, 30);
    await t.type(PG_UP);
    expect(t.frame()).not.toContain('lines below');
    expect(t.frame()).toContain('line 1\n');
  });

  it('off a TTY nothing changes: the transcript prints inline', async () => {
    const h = holder();
    const { App } = createApp({ theme: defaultTheme, modules: [echo, h.mod] });
    const r = render(<App columns={60} rows={12} />);
    for (let i = 1; i <= 30; i++) h.ctx().print(`line ${i}`);
    await tick();
    expect(r.lastFrame()).toContain('line 1\n');
  });

  it('a terminal shorter than the pinned rows renders without throwing', async () => {
    const t = onTerminal({ rows: 4, band: true });
    await fill(t, 10);
    await t.type(PG_UP);
    expect(t.frame()).not.toBe('');
  });

  it('a long session keeps only the newest lines, and says what it left out', async () => {
    const t = onTerminal({ rows: 100 });
    await fill(t, 1100);
    await tick();
    // Scroll to the very top: the oldest entries are not drawn.
    for (let i = 0; i < 12; i++) await t.type(PG_UP);
    expect(t.frame()).toMatch(/… \d+ earlier entries not shown/);
    expect(t.frame()).not.toContain('line 1\n');
  }, 30_000);

  it('createApp reports the resolved mode', () => {
    expect(createApp({ theme: defaultTheme, modules: [echo] }).fullscreen).toBe(true);
    expect(createApp({ theme: defaultTheme, modules: [echo], fullscreen: false }).fullscreen).toBe(
      false
    );
  });
});
