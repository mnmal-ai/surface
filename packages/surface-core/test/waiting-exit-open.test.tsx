import { defaultTheme } from '@mnmal-ai/surface-theme';
import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import { createApp, defineModule, type ModuleCtx, type WaitingViewProps } from '../src/index.js';
import { echo } from './fixture.js';

// A turn still waiting, the exit hint, and a panel opened only onto an empty surface.

const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const ENTER = '\r';

describe('a turn still waiting', () => {
  it('a turn overtaken by a later answer keeps a line, marked, until it lands', async () => {
    const { App } = createApp({ theme: defaultTheme, modules: [echo] });
    const r = render(<App columns={120} />);
    r.stdin.write('slow first');
    r.stdin.write(ENTER);
    r.stdin.write('quick');
    r.stdin.write(ENTER);
    await tick(30);
    // The quick answer landed and marked the slow ask; the slow turn's pending update shows,
    // marked, below the transcript.
    expect(r.lastFrame()).toContain('echo: quick');
    expect(r.lastFrame()).toMatch(/⟨\d+⟩ …/);
    await tick(120);
    expect(r.lastFrame()).toContain('echo: slow first');
    expect(r.lastFrame()).not.toMatch(/⟨\d+⟩ …/);
    r.unmount();
  });

  it("the app's waiting view draws every waiting turn, held or marked, with its pending update", async () => {
    const seen: string[] = [];
    const waiting = ({ flight, held, reply }: WaitingViewProps) => {
      const line = `WAIT[${held ? 'held' : 'marked'}] ${flight.question} ${String(reply?.data ?? '-')}`;
      seen.push(line);
      return line;
    };
    const { App } = createApp({ theme: defaultTheme, modules: [echo], entries: { waiting } });
    const r = render(<App columns={120} />);
    r.stdin.write('slow first');
    r.stdin.write(ENTER);
    await tick(10);
    expect(r.lastFrame()).toContain('WAIT[held] slow first …');
    r.stdin.write('quick');
    r.stdin.write(ENTER);
    await tick(30);
    expect(r.lastFrame()).toContain('WAIT[marked] slow first …');
    await tick(120);
    expect(r.lastFrame()).not.toContain('WAIT[');
    expect(seen.some((l) => l.startsWith('WAIT[held] quick'))).toBe(true);
    r.unmount();
  });
});

describe('the exit hint is the app’s', () => {
  it('in the toast row and in the band’s notice', async () => {
    for (const band of [false, true]) {
      const { App } = createApp({
        theme: defaultTheme,
        modules: [echo],
        band,
        exitHint: 'press ctrl-c again to leave · ctrl-shift-c copies'
      });
      const r = render(<App columns={120} />);
      r.stdin.write('\u0003');
      await tick();
      expect(r.lastFrame()).toContain('press ctrl-c again to leave · ctrl-shift-c copies');
      expect(r.lastFrame()).not.toContain('press ctrl+c again to exit');
      r.unmount();
    }
  });
});

describe('a panel opened only onto an empty surface', () => {
  type P = { pager: Record<string, never>; mine: Record<string, never> };
  it('ifNoneOpen opens when nothing is open, and never over a panel that is', async () => {
    const got: { ctx?: ModuleCtx<P> } = {};
    const m = defineModule<P>('fixture.opener', {
      init: (ctx) => {
        got.ctx = ctx;
        return undefined;
      },
      panels: { pager: { view: () => 'THE PAGER' }, mine: { view: () => 'THE OPERATOR PANEL' } }
    });
    const { App } = createApp({ theme: defaultTheme, modules: [echo, m] });
    const r = render(<App columns={120} />);
    await tick();
    const ctx = got.ctx as ModuleCtx<P>;
    ctx.open('mine', {});
    await tick();
    ctx.open('pager', {}, { ifNoneOpen: true });
    await tick();
    expect(r.lastFrame()).toContain('THE OPERATOR PANEL');
    expect(r.lastFrame()).not.toContain('THE PAGER');
    ctx.close();
    await tick();
    ctx.open('pager', {}, { ifNoneOpen: true });
    await tick();
    expect(r.lastFrame()).toContain('THE PAGER');
    r.unmount();
  });
});

describe('a note drawn by the app', () => {
  it("the app's note view draws every note, and without one the text is drawn as before", async () => {
    const note = defineModule('fixture.noter', {
      commands: [{ name: 'note', summary: 's', args: [], run: (_, ctx) => ctx.print('a note') }]
    });
    for (const withView of [true, false]) {
      const { App } = createApp({
        theme: defaultTheme,
        modules: [echo, note],
        ...(withView ? { entries: { note: ({ entry }) => `NOTE · ${entry.text}` } } : {})
      });
      const r = render(<App columns={120} />);
      r.stdin.write('/note');
      r.stdin.write(ENTER);
      await tick();
      if (withView) expect(r.lastFrame()).toContain('NOTE · a note');
      else {
        expect(r.lastFrame()).toContain('a note');
        expect(r.lastFrame()).not.toContain('NOTE ·');
      }
      r.unmount();
    }
  });
});

describe('the palette runs a command whose arguments are all optional', () => {
  const cmds = defineModule('fixture.args', {
    commands: [
      {
        name: 'show',
        summary: 'optional argument',
        args: [{ name: 'what', optional: true }],
        run: (args, ctx) => ctx.print(`showed ${args.join(' ') || 'everything'}`)
      },
      {
        name: 'keep',
        summary: 'required argument',
        args: [{ name: 'fact' }],
        run: (args, ctx) => ctx.print(`kept ${args.join(' ')}`)
      }
    ]
  });

  it('Enter runs one with only optional arguments bare; Tab still fills it for an argument', async () => {
    const { App } = createApp({ theme: defaultTheme, modules: [echo, cmds] });
    const r = render(<App columns={120} />);
    r.stdin.write('/sho');
    await tick();
    r.stdin.write(ENTER);
    await tick();
    expect(r.lastFrame()).toContain('showed everything');
    r.stdin.write('/sho');
    await tick();
    r.stdin.write('\t');
    await tick();
    // The filled draft, its trailing space trimmed by the frame.
    expect(r.lastFrame()).toContain('› /show');
    r.unmount();
  });

  it('Enter on one that needs an argument fills it, rather than running it without one', async () => {
    const { App } = createApp({ theme: defaultTheme, modules: [echo, cmds] });
    const r = render(<App columns={120} />);
    r.stdin.write('/kee');
    await tick();
    r.stdin.write(ENTER);
    await tick();
    expect(r.lastFrame()).not.toContain('kept');
    expect(r.lastFrame()).toContain('› /keep');
    r.unmount();
  });
});
