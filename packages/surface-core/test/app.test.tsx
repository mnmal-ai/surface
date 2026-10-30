import { defaultTheme } from '@mnmal-ai/surface-theme';
import { Box, Text } from 'ink';
import { render } from 'ink-testing-library';
import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  type AnswerViewProps,
  type AskViewProps,
  answerEntry,
  assertComposes,
  CTRL_C_WINDOW_MS,
  createApp,
  defaultPanelRows,
  defineModule,
  MENU_NAME_WIDTH,
  type ModuleCtx,
  type TuiModule,
  type TurnContext
} from '../src/index.js';
import { echo, panels, releaseSlow } from './fixture.js';

const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));

/** Retries `check` until it passes, rethrowing its last failure after `ms`. */
async function until(check: () => void, ms = 2000): Promise<void> {
  const end = Date.now() + ms;
  for (;;) {
    try {
      return check();
    } catch (e) {
      if (Date.now() > end) throw e;
    }
    await tick(10);
  }
}
const ENTER = '\r';
const ESC = '\u001B';
const TAB = '\t';

function start(columns = 120) {
  const { App } = createApp({ theme: defaultTheme, modules: [echo, panels], railMinColumns: 80 });
  const r = render(<App columns={columns} />);
  return { ...r, frame: () => r.lastFrame() ?? '' };
}

describe('createApp shell (contract fixture)', () => {
  it('composes', () => {
    expect(() => assertComposes([echo, panels])).not.toThrow();
  });

  it('a turn shows pending, then lands with its renderer and chip', async () => {
    const app = start();
    app.stdin.write('hi');
    app.stdin.write(ENTER);
    await tick(60);
    expect(app.frame()).toContain('echo: hi');
    expect(app.frame()).toContain('fixture');
  });

  it('an overtaken turn gets matching marks', async () => {
    const app = start();
    app.stdin.write('slow one');
    app.stdin.write(ENTER);
    app.stdin.write('fast');
    app.stdin.write(ENTER);
    await tick();
    releaseSlow();
    await tick();
    const f = app.frame();
    expect(f).toContain('⟨1⟩');
    expect(f).toContain('↩ ⟨1⟩');
    expect(f).toContain('echo: slow one');
  });

  it('a handler that throws becomes a failed reply and releases its ask', async () => {
    const app = start();
    app.stdin.write('boom');
    app.stdin.write(ENTER);
    await tick(60);
    expect(app.frame()).toContain('handler exploded');
    expect(app.frame()).not.toContain('Thinking');
  });

  it('commands print notes; unknown commands say so', async () => {
    const app = start();
    app.stdin.write('/hello');
    app.stdin.write(ENTER);
    await tick();
    expect(app.frame()).toContain('hello from a command');
    app.stdin.write('/nope');
    app.stdin.write(ENTER);
    await tick();
    expect(app.frame()).toContain('unknown command /nope');
  });

  it('the palette lists registered commands as / is typed', async () => {
    const app = start();
    app.stdin.write('/');
    await tick();
    expect(app.frame()).toContain('/hello');
    expect(app.frame()).toContain('/info');
  });

  it('the palette draws a name column, the summary and a hint line', async () => {
    const app = start();
    app.stdin.write('/');
    await tick();
    const line =
      app
        .frame()
        .split('\n')
        .find((l) => l.includes('/hello')) ?? '';
    expect(line).not.toContain(' — ');
    expect(line.indexOf('print a note') - line.indexOf('/hello')).toBe(MENU_NAME_WIDTH);
    expect(app.frame()).toContain('↑↓ select · tab complete · enter run · esc close');
    app.stdin.write('zzz');
    await tick();
    expect(app.frame()).toContain('no command matches /zzz');
  });

  it('a long palette shows only what fits, and the window follows the selection', async () => {
    const many = defineModule('fixture.many', {
      commands: Array.from({ length: 30 }, (_, i) => ({
        name: `cmd${String(i).padStart(2, '0')}`,
        summary: `command ${i}`,
        args: [],
        run: () => {}
      }))
    });
    const { App } = createApp({ theme: defaultTheme, modules: [echo, many] });
    const r = render(<App columns={100} rows={14} />);
    const frame = () => r.lastFrame() ?? '';
    r.stdin.write('/cmd');
    await tick();
    expect(frame()).toContain('/cmd00');
    expect(frame()).not.toContain('/cmd29');
    expect(frame()).toMatch(/1–\d+ of 30/);
    for (let i = 0; i < 20; i++) r.stdin.write('\u001B[B');
    await tick(80);
    expect(frame()).toContain('/cmd20');
    expect(frame()).not.toContain('/cmd00');
    expect(frame().split('\n').length).toBeLessThanOrEqual(14);
  });

  it('a menu sizes from the outer panel rows, less its hint line and its own row padding', async () => {
    const many = defineModule('fixture.many', {
      commands: Array.from({ length: 60 }, (_, i) => ({
        name: `cmd${String(i).padStart(2, '0')}`,
        summary: `command ${i}`,
        args: [],
        run: () => {}
      }))
    });
    const { App } = createApp({ theme: defaultTheme, modules: [echo, many] });
    const r = render(<App columns={100} rows={40} />);
    r.stdin.write('/cmd');
    await tick();
    // Outer rows, less the hint line, less a padding row top and bottom: the menu never grows.
    expect(r.lastFrame() ?? '').toContain(`1–${defaultPanelRows(40, {}) - 3} of 60`);
  });

  it('a panel opens, takes its own keys, and closes on escape', async () => {
    const app = start();
    app.stdin.write('/info');
    app.stdin.write(ENTER);
    await tick();
    expect(app.frame()).toContain('info count=0');
    app.stdin.write('+');
    await tick();
    expect(app.frame()).toContain('info count=1');
    app.stdin.write(ESC);
    await tick();
    expect(app.frame()).not.toContain('info count=');
  });

  it('tab completes from module completers', async () => {
    const app = start();
    app.stdin.write('ap');
    app.stdin.write(TAB);
    await tick(200);
    expect(app.frame()).toContain('apple');
  });

  it('a multi-line paste submits each line in order, commands included', async () => {
    const app = start();
    app.stdin.write('first\n/hello\nsecond\n');
    await tick(80);
    const f = app.frame();
    expect(f.indexOf('echo: first')).toBeGreaterThanOrEqual(0);
    expect(f).toContain('hello from a command');
    expect(f.indexOf('echo: second')).toBeGreaterThan(f.indexOf('echo: first'));
  });

  it('a bracketed paste folds into one draft line and runs nothing', async () => {
    const app = start();
    app.stdin.write('\u001B[200~a\n/hello\u001B[201~');
    await tick(80);
    const f = app.frame();
    expect(f).toContain('a /hello');
    expect(f).not.toContain('hello from a command');
    expect(f).not.toContain('echo: a');
  });

  it('a chunk arriving while a panel is open does not reach the draft', async () => {
    const app = start();
    app.stdin.write('/info');
    app.stdin.write(ENTER);
    await tick();
    app.stdin.write('hidden\nline\n');
    await tick();
    app.stdin.write(ESC);
    await tick();
    expect(app.frame()).not.toContain('echo: hidden');
    expect(app.frame()).not.toContain('hidden');
  });

  it('hides the rail below railMinColumns', async () => {
    expect(start(120).frame()).toContain('RAIL');
    expect(start(60).frame()).not.toContain('RAIL');
  });

  it('runs each module init once on mount and its disposer on unmount', async () => {
    let inits = 0;
    let disposed = 0;
    const lifecycle = defineModule('fixture.life', {
      init: () => {
        inits += 1;
        return () => {
          disposed += 1;
        };
      }
    });
    const { App } = createApp({ theme: defaultTheme, modules: [lifecycle] });
    const r = render(<App columns={120} />);
    await tick();
    expect(inits).toBe(1);
    expect(disposed).toBe(0);
    r.unmount();
    expect(disposed).toBe(1);
  });

  it('one ctrl+c does not exit; it arms with a hint', async () => {
    const app = start();
    app.stdin.write('\u0003');
    await tick();
    expect(app.frame()).toContain('press ctrl+c again to exit');
  });

  it('a slow completion that resolves after more typing is discarded', async () => {
    const slow = defineModule('fixture.slow', {
      completers: [
        {
          id: 'slow',
          complete: async () => {
            await new Promise((r) => setTimeout(r, 40));
            return [{ label: 'zebra', insert: 'zebra' }];
          }
        }
      ]
    });
    const { App } = createApp({ theme: defaultTheme, modules: [slow] });
    const r = render(<App columns={120} />);
    r.stdin.write('ze');
    r.stdin.write(TAB);
    r.stdin.write('x');
    await tick(120);
    const f = r.lastFrame() ?? '';
    expect(f).toContain('zex');
    expect(f).not.toContain('zebra');
  });

  it('renders a status item and fires a global key binding', async () => {
    const app = start();
    expect(app.frame()).toContain('STATUS-ITEM');
    app.stdin.write('\u0010');
    await tick();
    expect(app.frame()).toContain('global fired');
  });

  it('a command line typed and entered in one tick runs the command', async () => {
    const app = start();
    app.stdin.write('/hel');
    app.stdin.write(ENTER);
    await tick();
    expect(app.frame()).toContain('hello from a command');
  });
});

const hang = (seen: AbortSignal[] = []) =>
  defineModule('fixture.hang', {
    turns: [
      {
        id: 'hang',
        claims: (t) => (t.startsWith('hang') ? 5 : false),
        async *answer(_t: string, _c: unknown, signal: AbortSignal): AsyncIterable<never> {
          seen.push(signal);
          await new Promise(() => {});
        }
      }
    ]
  });

describe('cancel, exit, sanitising and lifetimes', () => {
  it('escape cancels a turn that ignores its signal and drops its pending indicator', async () => {
    const { App } = createApp({ theme: defaultTheme, modules: [hang()] });
    const r = render(<App columns={120} />);
    r.stdin.write('hang');
    r.stdin.write(ENTER);
    await tick();
    expect(r.lastFrame()).toContain('Thinking');
    r.stdin.write(ESC);
    await tick();
    expect(r.lastFrame()).toContain('cancelled');
    expect(r.lastFrame()).not.toContain('Thinking');
  });

  it('two escapes cancel two pending turns, newest first', async () => {
    const seen: AbortSignal[] = [];
    const { App } = createApp({ theme: defaultTheme, modules: [hang(seen)] });
    const r = render(<App columns={120} />);
    r.stdin.write('hang a');
    r.stdin.write(ENTER);
    r.stdin.write('hang b');
    r.stdin.write(ENTER);
    await tick();
    r.stdin.write(ESC);
    await tick();
    expect(seen.map((s) => s.aborted)).toEqual([false, true]);
    r.stdin.write(ESC);
    await tick();
    expect(seen.map((s) => s.aborted)).toEqual([true, true]);
    expect(r.lastFrame()).not.toContain('Thinking');
  });

  it('unmount aborts the app signal and every live turn', async () => {
    const seen: AbortSignal[] = [];
    let app: AbortSignal | undefined;
    const probe = defineModule('fixture.probe', {
      init: (ctx: ModuleCtx<Record<string, never>>) => {
        app = ctx.signal;
        return undefined;
      }
    });
    const { App } = createApp({ theme: defaultTheme, modules: [probe, hang(seen)] });
    const r = render(<App columns={120} />);
    r.stdin.write('hang');
    r.stdin.write(ENTER);
    await tick();
    expect(app?.aborted).toBe(false);
    r.unmount();
    expect(app?.aborted).toBe(true);
    expect(seen[0]?.aborted).toBe(true);
  });

  it('strips terminal escapes from ctx.print', async () => {
    const m = defineModule('fixture.esc', {
      commands: [
        {
          name: 'esc',
          summary: 's',
          args: [],
          run: (_, ctx) => ctx.print('\u001b]0;pwned\u0007hi')
        }
      ]
    });
    const { App } = createApp({ theme: defaultTheme, modules: [m] });
    const r = render(<App columns={120} />);
    r.stdin.write('/esc');
    r.stdin.write(ENTER);
    await tick();
    const f = r.lastFrame() ?? '';
    expect(f).toContain('hi');
    expect(f).not.toContain('pwned');
    expect(f).not.toContain('\u001b]');
  });

  it('toasts and the ctrl+c hint clear after a timeout', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    try {
      const m = defineModule('fixture.toast', {
        commands: [
          { name: 'toast', summary: 's', args: [], run: (_, ctx) => ctx.toast('heads up') }
        ]
      });
      const { App } = createApp({ theme: defaultTheme, modules: [m] });
      const r = render(<App columns={120} />);
      r.stdin.write('/toast');
      r.stdin.write(ENTER);
      await vi.advanceTimersByTimeAsync(50);
      expect(r.lastFrame()).toContain('heads up');
      await vi.advanceTimersByTimeAsync(3100);
      await vi.advanceTimersByTimeAsync(100);
      expect(r.lastFrame()).not.toContain('heads up');
      r.stdin.write('\u0003');
      await vi.advanceTimersByTimeAsync(50);
      expect(r.lastFrame()).toContain('press ctrl+c again');
      await vi.advanceTimersByTimeAsync(1700);
      await vi.advanceTimersByTimeAsync(100);
      expect(r.lastFrame()).not.toContain('press ctrl+c again');
      r.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('ctx.close closes only its own overlay; ctx.open of an unknown panel throws', async () => {
    let otherCtx: ModuleCtx<Record<string, never>> | undefined;
    let threw = false;
    const other = defineModule('fixture.other', {
      init: (ctx: ModuleCtx<Record<string, never>>) => {
        otherCtx = ctx;
        return undefined;
      }
    });
    const { App } = createApp({ theme: defaultTheme, modules: [echo, panels, other] });
    const r = render(<App columns={120} />);
    r.stdin.write('/info');
    r.stdin.write(ENTER);
    await tick();
    expect(r.lastFrame()).toContain('info count=0');
    otherCtx?.close();
    await tick();
    expect(r.lastFrame()).toContain('info count=0');
    try {
      // biome-ignore lint/suspicious/noExplicitAny: deliberately open a panel this module lacks
      (otherCtx as any).open('nope', {});
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});

describe('menus', () => {
  const menus = defineModule('fixture.menus', {
    commands: [
      { name: 'confirm', summary: 'c', args: [], run: (_, ctx) => ctx.print('CONFIRM RAN') },
      { name: 'why', summary: 'w', args: [], run: (_, ctx) => ctx.print('WHY RAN') },
      { name: 'citations', summary: 'c', args: [], run: (_, ctx) => ctx.print('CITATIONS RAN') }
    ],
    completers: [
      {
        id: 'al',
        complete: (d) =>
          d.endsWith('al')
            ? [
                { label: 'alpha', insert: 'alpha' },
                { label: 'alps', insert: 'alps' }
              ]
            : []
      }
    ]
  });
  const mount = () => {
    const { App } = createApp({ theme: defaultTheme, modules: [menus] });
    return render(<App columns={120} />);
  };

  it('Enter on /rm never runs /confirm; the line is sent as typed', async () => {
    const r = mount();
    r.stdin.write('/rm');
    r.stdin.write(ENTER);
    await tick();
    expect(r.lastFrame()).toContain('unknown command /rm');
    expect(r.lastFrame()).not.toContain('CONFIRM RAN');
  });

  it('a substring-only palette row runs on Enter only after the selection moved', async () => {
    const r = mount();
    r.stdin.write('/tat');
    await tick();
    expect(r.lastFrame()).toContain('/citations');
    r.stdin.write(ENTER);
    await tick();
    expect(r.lastFrame()).toContain('unknown command /tat');
    expect(r.lastFrame()).not.toContain('CITATIONS RAN');
    r.stdin.write('/tat');
    await tick();
    r.stdin.write('\u001B[B');
    r.stdin.write('\u001B[A');
    await tick();
    r.stdin.write(ENTER);
    await tick();
    expect(r.lastFrame()).toContain('CITATIONS RAN');
  });

  it('an uppercase query opens the palette and Enter runs the lowercase command', async () => {
    const r = mount();
    r.stdin.write('/W');
    await tick();
    expect(r.lastFrame()).toContain('/why');
    r.stdin.write('\r');
    await tick();
    expect(r.lastFrame()).toContain('WHY RAN');
    r.stdin.write('/Why');
    r.stdin.write(ENTER);
    await tick();
    expect(r.lastFrame()).toContain('WHY RAN');
  });

  it('a cursor-only move keeps the arrow choice', async () => {
    const r = mount();
    r.stdin.write('/tat');
    await tick();
    r.stdin.write('\u001B[B');
    r.stdin.write('\u001B[A');
    await tick();
    r.stdin.write('\u001B[D');
    await tick();
    r.stdin.write(ENTER);
    await tick();
    expect(r.lastFrame()).toContain('CITATIONS RAN');
  });

  it('typing after a move resets it, so Enter sends the line as typed', async () => {
    const r = mount();
    r.stdin.write('/tat');
    await tick();
    r.stdin.write('\u001B[B');
    await tick();
    r.stdin.write('i');
    await tick();
    r.stdin.write(ENTER);
    await tick();
    expect(r.lastFrame()).toContain('unknown command /tati');
    expect(r.lastFrame()).not.toContain('CITATIONS RAN');
  });

  it('Esc closes the palette and keeps the draft', async () => {
    const r = mount();
    r.stdin.write('/tat');
    await tick();
    expect(r.lastFrame()).toContain('/citations');
    r.stdin.write(ESC);
    await tick(100);
    expect(r.lastFrame()).not.toContain('/citations');
    expect(r.lastFrame()).toContain('/tat');
  });

  it('Enter on an empty palette sends the line as typed', async () => {
    const r = mount();
    r.stdin.write('/zz');
    r.stdin.write(ENTER);
    await tick();
    expect(r.lastFrame()).toContain('unknown command /zz');
  });

  it('typing past a completion menu closes it and keeps the draft', async () => {
    const r = mount();
    r.stdin.write('al');
    r.stdin.write(TAB);
    await tick(200);
    expect(r.lastFrame()).toContain('alpha');
    expect(r.lastFrame()).toContain('alps');
    r.stdin.write('x');
    await tick();
    expect(r.lastFrame()).not.toContain('alpha');
    expect(r.lastFrame()).toContain('alx');
  });

  it('a multi-item completion menu moves with down and accepts with enter', async () => {
    const r = mount();
    r.stdin.write('al');
    r.stdin.write(TAB);
    await tick(200);
    r.stdin.write('\u001B[B');
    await tick();
    r.stdin.write(ENTER);
    await tick();
    const f = r.lastFrame() ?? '';
    expect(f).toContain('alps');
    expect(f).not.toContain('alpha');
  });
});

declare module '../src/module.js' {
  interface TuiEvents {
    'fixture/ping': { n: number };
  }
}

type Ctx = ModuleCtx<Record<string, never>>;

describe('module failures are isolated', () => {
  it('a throwing renderer renders a one-line error and the app lives', async () => {
    const m = defineModule('fixture.badrender', {
      turns: [
        {
          id: 'bad',
          claims: (t) => (t === 'bad' ? 9 : false),
          async *answer() {
            yield { phase: 'final' as const, reply: { kind: 'fixture.bad', data: 1 } };
          }
        }
      ],
      renderers: {
        'fixture.bad': () => {
          throw new Error('render exploded');
        }
      }
    });
    const { App } = createApp({ theme: defaultTheme, modules: [echo, m] });
    const r = render(<App columns={120} />);
    r.stdin.write('bad');
    r.stdin.write(ENTER);
    await tick(80);
    expect(r.lastFrame()).toContain('fixture.badrender view failed');
    r.stdin.write('hi');
    r.stdin.write(ENTER);
    await tick(80);
    expect(r.lastFrame()).toContain('echo: hi');
  });

  it('a global that throws or rejects is reported by module name and the app lives', async () => {
    const m = defineModule('fixture.badglobal', {
      keymap: [
        {
          key: 'ctrl+r',
          run: () => {
            throw new Error('sync boom');
          }
        },
        { key: 'ctrl+t', run: (async () => Promise.reject(new Error('async boom'))) as () => void }
      ]
    });
    const { App } = createApp({ theme: defaultTheme, modules: [m] });
    const r = render(<App columns={120} />);
    r.stdin.write('\u0012');
    await tick();
    expect(r.lastFrame()).toContain('fixture.badglobal: sync boom');
    r.stdin.write('\u0014');
    await tick();
    expect(r.lastFrame()).toContain('fixture.badglobal: async boom');
  });

  it('a throwing event listener and a throwing init are reported, not fatal', async () => {
    let emitter: Ctx | undefined;
    const m = defineModule('fixture.bus', {
      init: (ctx: Ctx) => {
        emitter = ctx;
        ctx.on('fixture/ping', () => {
          throw new Error('listener boom');
        });
        return undefined;
      }
    });
    const bad = defineModule('fixture.badinit', {
      init: () => {
        throw new Error('init boom');
      }
    });
    const { App } = createApp({ theme: defaultTheme, modules: [m, bad] });
    const r = render(<App columns={120} />);
    await tick();
    expect(r.lastFrame()).toContain('fixture.badinit: init boom');
    emitter?.emit('fixture/ping', { n: 1 });
    await tick();
    expect(r.lastFrame()).toContain('fixture.bus: listener boom');
  });

  it('a panel handler that throws is reported and the panel stays', async () => {
    const m = defineModule<{ p: { n: number } }>('fixture.badpanel', {
      commands: [{ name: 'bp', summary: 's', args: [], run: (_, ctx) => ctx.open('p', { n: 0 }) }],
      panels: {
        p: {
          view: ({ state }) => `PANEL ${state.n}`,
          keymap: [{ key: '+', act: 'boom' }],
          on: {
            boom: () => {
              throw new Error('panel boom');
            }
          }
        }
      }
    });
    const { App } = createApp({ theme: defaultTheme, modules: [m] });
    const r = render(<App columns={120} />);
    r.stdin.write('/bp');
    r.stdin.write(ENTER);
    await tick();
    r.stdin.write('+');
    await tick();
    expect(r.lastFrame()).toContain('fixture.badpanel: panel boom');
    expect(r.lastFrame()).toContain('PANEL 0');
  });
});

describe('typed events', () => {
  it('round-trips a declared event, and an undeclared one is a type error', () => {
    let a: Ctx | undefined;
    let got: number | undefined;
    const m = defineModule('fixture.typed', {
      init: (ctx: Ctx) => {
        a = ctx;
        ctx.on('fixture/ping', (p) => {
          got = p.n;
        });
        return undefined;
      }
    });
    const { App } = createApp({ theme: defaultTheme, modules: [m] });
    const r = render(<App columns={120} />);
    a?.emit('fixture/ping', { n: 7 });
    expect(got).toBe(7);
    // @ts-expect-error 'fixture/unknown' is not declared in TuiEvents
    a?.emit('fixture/unknown', {});
    r.unmount();
  });
});

describe('lifetimes and echoes', () => {
  it('sanitises the ask echo, including text from ctx.submit', async () => {
    const m = defineModule('fixture.sub', {
      commands: [
        { name: 'sub', summary: 's', args: [], run: (_, ctx) => ctx.submit('safe\rEVIL\b') }
      ]
    });
    const { App } = createApp({ theme: defaultTheme, modules: [echo, m] });
    const r = render(<App columns={120} />);
    r.stdin.write('/sub');
    r.stdin.write(ENTER);
    await tick(80);
    expect(r.lastFrame()).toContain('safeEVIL');
  });

  it('a panel handler that closes the panel and returns state leaves it closed', async () => {
    const m = defineModule<{ p: { n: number } }>('fixture.closer', {
      commands: [{ name: 'cp', summary: 's', args: [], run: (_, ctx) => ctx.open('p', { n: 0 }) }],
      panels: {
        p: {
          view: ({ state }) => `PANEL ${state.n}`,
          keymap: [{ key: '+', act: 'go' }],
          on: {
            go: (s, ctx) => {
              ctx.close();
              return { n: s.n + 1 };
            }
          }
        }
      }
    });
    const { App } = createApp({ theme: defaultTheme, modules: [m] });
    const r = render(<App columns={120} />);
    r.stdin.write('/cp');
    r.stdin.write(ENTER);
    await tick();
    r.stdin.write('+');
    await tick();
    expect(r.lastFrame()).not.toContain('PANEL');
  });

  it('is StrictMode-safe: init re-arms, and the app is not left disposed', async () => {
    let signal: AbortSignal | undefined;
    const m = defineModule('fixture.strict', {
      init: (ctx: Ctx) => {
        signal = ctx.signal;
        return undefined;
      },
      commands: [{ name: 'say', summary: 's', args: [], run: (_, ctx) => ctx.print('said it') }]
    });
    const { App } = createApp({ theme: defaultTheme, modules: [m] });
    const r = render(
      <StrictMode>
        <App columns={120} />
      </StrictMode>
    );
    await tick();
    expect(signal?.aborted).toBe(false);
    r.stdin.write('/say');
    r.stdin.write(ENTER);
    await tick();
    expect(r.lastFrame()).toContain('said it');
  });

  it('ctx.submit, open and close are no-ops after unmount', async () => {
    let ctx: ModuleCtx<{ p: { n: number } }> | undefined;
    const ran: string[] = [];
    const m = defineModule<{ p: { n: number } }>('fixture.late', {
      init: (c) => {
        ctx = c;
        return undefined;
      },
      panels: { p: { view: () => 'P' } },
      turns: [
        {
          id: 'late',
          claims: () => 1,
          async *answer(t: string) {
            ran.push(t);
            yield { phase: 'final' as const, reply: { kind: 'x', data: t } };
          }
        }
      ]
    });
    const { App } = createApp({ theme: defaultTheme, modules: [m] });
    const r = render(<App columns={120} />);
    await tick();
    r.unmount();
    ctx?.submit('after exit');
    ctx?.open('p', { n: 1 });
    ctx?.close();
    await tick();
    expect(ran).toEqual([]);
  });
});

describe('letter, then Enter', () => {
  const review = defineModule<{ review: { approved: number; pos?: number } }>('fixture.review', {
    commands: [
      {
        name: 'review',
        summary: 'r',
        args: [],
        run: (_, ctx) => ctx.open('review', { approved: 0 })
      }
    ],
    panels: {
      review: {
        view: ({ state, armed }) =>
          `REVIEW approved=${state.approved}${armed ? ` · enter ${armed.label}` : ''}`,
        keymap: [{ key: 'down', act: 'next' }],
        confirm: [{ key: 'a', act: 'approve', label: 'approves it' }],
        on: {
          approve: (s, ctx) => {
            ctx.print('APPROVED');
            return { approved: s.approved + 1 };
          },
          next: (s) => ({ ...s, pos: (s.pos ?? 0) + 1 })
        }
      }
    }
  });
  const mount = async () => {
    const { App } = createApp({ theme: defaultTheme, modules: [echo, review] });
    const r = render(<App columns={120} />);
    r.stdin.write('/review');
    r.stdin.write(ENTER);
    await tick();
    return { ...r, frame: () => r.lastFrame() ?? '' };
  };
  const BACKSPACE = '\u007F';

  it('the letter on an empty line is typed and arms; Enter runs the act once, as no turn', async () => {
    const app = await mount();
    app.stdin.write('a');
    await tick();
    expect(app.frame()).toContain('enter approves it');
    app.stdin.write(ENTER);
    await tick(60);
    expect(app.frame()).toContain('APPROVED');
    expect(app.frame()).toContain('REVIEW approved=1');
    expect(app.frame()).not.toContain('echo: a');
  });

  it('a message that starts with the letter is text, sent as typed', async () => {
    const app = await mount();
    app.stdin.write('are you there');
    await tick();
    expect(app.frame()).not.toContain('enter approves it');
    app.stdin.write(ENTER);
    await tick(60);
    expect(app.frame()).toContain('echo: are you there');
    expect(app.frame()).not.toContain('APPROVED');
  });

  it('any other edit disarms, even one that leaves just the letter', async () => {
    const app = await mount();
    app.stdin.write('a');
    await tick();
    app.stdin.write('b');
    await tick();
    app.stdin.write(BACKSPACE);
    await tick();
    expect(app.frame()).not.toContain('enter approves it');
    app.stdin.write(ENTER);
    await tick(60);
    expect(app.frame()).toContain('echo: a');
    expect(app.frame()).not.toContain('APPROVED');
  });

  it('a change of the panel state disarms: Enter never acts on a row it was not armed on', async () => {
    const app = await mount();
    app.stdin.write('a');
    await tick();
    expect(app.frame()).toContain('enter approves it');
    app.stdin.write('\u001B[B');
    await tick();
    expect(app.frame()).not.toContain('enter approves it');
    app.stdin.write(ENTER);
    await tick(60);
    expect(app.frame()).toContain('echo: a');
    expect(app.frame()).not.toContain('APPROVED');
  });

  it('the exit chord disarms: a later Enter sends the letter as typed', async () => {
    const app = await mount();
    app.stdin.write('a');
    await tick();
    app.stdin.write('\u0003');
    await tick();
    expect(app.frame()).not.toContain('enter approves it');
    app.stdin.write(ENTER);
    await tick(60);
    expect(app.frame()).toContain('echo: a');
    expect(app.frame()).not.toContain('APPROVED');
  });

  it('escape closes the panel and disarms, and the typed letter stays in the line', async () => {
    const app = await mount();
    app.stdin.write('a');
    await tick();
    app.stdin.write(ESC);
    await tick(100);
    expect(app.frame()).not.toContain('REVIEW');
    app.stdin.write(ENTER);
    await tick(60);
    expect(app.frame()).toContain('echo: a');
    expect(app.frame()).not.toContain('APPROVED');
  });

  it('a confirm handler that throws leaves the armed letter in the line, so Enter retries', async () => {
    let attempts = 0;
    const flaky = defineModule<{ review: { approved: number } }>('fixture.flaky', {
      commands: [
        {
          name: 'flaky',
          summary: 'f',
          args: [],
          run: (_, ctx) => ctx.open('review', { approved: 0 })
        }
      ],
      panels: {
        review: {
          view: ({ state, armed }) =>
            `FLAKY approved=${state.approved}${armed ? ` · enter ${armed.label}` : ''}`,
          confirm: [{ key: 'a', act: 'approve', label: 'approves it' }],
          on: {
            approve: (s) => {
              attempts += 1;
              if (attempts === 1) throw new Error('the act failed');
              return { approved: s.approved + 1 };
            }
          }
        }
      }
    });
    const { App } = createApp({ theme: defaultTheme, modules: [flaky] });
    const r = render(<App columns={120} />);
    r.stdin.write('/flaky');
    r.stdin.write(ENTER);
    await tick();
    r.stdin.write('a');
    await tick();
    expect(r.lastFrame()).toContain('enter approves it');
    r.stdin.write(ENTER);
    await tick(60);
    expect(r.lastFrame()).toContain('enter approves it');
    r.stdin.write(ENTER);
    await tick(60);
    expect(r.lastFrame()).toContain('FLAKY approved=1');
  });
});

describe('a panel that owns the input line', () => {
  let empties = 0;
  const editor = defineModule<{ list: { items: string[]; renaming: boolean } }>('fixture.editor', {
    commands: [
      {
        name: 'edit',
        summary: 'e',
        args: [],
        run: (_, ctx) => ctx.open('list', { items: [], renaming: false })
      }
    ],
    panels: {
      list: {
        view: ({ state }) =>
          `LIST ${state.items.join(',') || '(none)'}${state.renaming ? ' · renaming' : ''}`,
        keymap: [{ key: 'ctrl+r', act: 'rename' }],
        on: {
          rename: (s, ctx) => {
            ctx.setDraft(s.items.at(-1) ?? '');
            return { ...s, renaming: true };
          }
        },
        submit: (s, line) => {
          const text = line.trim();
          if (text === '') {
            empties += 1;
            return undefined;
          }
          return s.renaming
            ? { items: [...s.items.slice(0, -1), text], renaming: false }
            : { ...s, items: [...s.items, text] };
        },
        escape: (s, ctx) => {
          if (!s.renaming) return undefined;
          ctx.setDraft('');
          return { ...s, renaming: false };
        }
      }
    }
  });
  const mount = async () => {
    const { App } = createApp({ theme: defaultTheme, modules: [echo, panels, editor] });
    const r = render(<App columns={120} />);
    r.stdin.write('/edit');
    r.stdin.write(ENTER);
    await tick();
    return { ...r, frame: () => r.lastFrame() ?? '' };
  };

  it('a typed line is an entry, not a turn, and stays out of the history', async () => {
    const app = await mount();
    app.stdin.write('milk');
    app.stdin.write(ENTER);
    await tick(60);
    expect(app.frame()).toContain('LIST milk');
    expect(app.frame()).not.toContain('echo: milk');
    app.stdin.write('\u001B[A');
    await tick();
    expect(app.frame()).not.toContain('› milk');
  });

  it('a /command still runs, and the empty line reaches the panel', async () => {
    const app = await mount();
    app.stdin.write('/hello');
    app.stdin.write(ENTER);
    await tick(60);
    expect(app.frame()).toContain('hello from a command');
    expect(app.frame()).toContain('LIST (none)');
    const before = empties;
    app.stdin.write(ENTER);
    await tick(60);
    expect(empties).toBe(before + 1);
  });

  it('ctx.setDraft prefills a rename, and Enter commits the edited line', async () => {
    const app = await mount();
    app.stdin.write('milk');
    app.stdin.write(ENTER);
    await tick();
    app.stdin.write('\u0012');
    await tick();
    expect(app.frame()).toContain('renaming');
    expect(app.frame()).toContain('› milk');
    app.stdin.write('s');
    app.stdin.write(ENTER);
    await tick(60);
    expect(app.frame()).toContain('LIST milks');
  });

  it('the first escape abandons the edit and clears the line, the second closes', async () => {
    const app = await mount();
    app.stdin.write('milk');
    app.stdin.write(ENTER);
    await tick();
    app.stdin.write('\u0012');
    await tick();
    app.stdin.write(ESC);
    await tick(100);
    expect(app.frame()).toContain('LIST milk');
    expect(app.frame()).not.toContain('renaming');
    expect(app.frame()).not.toContain('› milk');
    app.stdin.write(ESC);
    await tick(100);
    expect(app.frame()).not.toContain('LIST');
  });
});

describe('escape may hand off to another panel', () => {
  const stages = defineModule<{
    form: { step: string };
    review: { from: string };
  }>('fixture.stages', {
    commands: [
      { name: 'form', summary: 'f', args: [], run: (_, ctx) => ctx.open('form', { step: 'a' }) }
    ],
    panels: {
      form: {
        view: ({ state }) => `FORM ${state.step}`,
        submit: () => undefined,
        escape: (s, ctx) => {
          ctx.open('review', { from: s.step });
          return undefined;
        }
      },
      review: { view: ({ state }) => `REVIEW from ${state.from}` }
    }
  });

  it('a panel opened inside escape survives the close that follows', async () => {
    const { App } = createApp({ theme: defaultTheme, modules: [echo, stages] });
    const r = render(<App columns={120} />);
    r.stdin.write('/form');
    r.stdin.write(ENTER);
    await tick();
    expect(r.lastFrame()).toContain('FORM a');
    r.stdin.write(ESC);
    await tick(100);
    expect(r.lastFrame()).toContain('REVIEW from a');
    expect(r.lastFrame()).not.toContain('FORM a');
    r.stdin.write(ESC);
    await tick(100);
    expect(r.lastFrame()).not.toContain('REVIEW');
  });
});

describe('input band and presence slot', () => {
  const EDGE = '┃';
  const withPresence = (name: string, view?: () => string) =>
    defineModule('fixture.presence', { presence: { name, ...(view ? { view } : {}) } });
  function startBand(opts: { band?: boolean; modules?: TuiModule[] } = {}) {
    const { App } = createApp({
      theme: defaultTheme,
      modules: opts.modules ?? [echo],
      ...(opts.band !== undefined ? { band: opts.band } : {})
    });
    const r = render(<App columns={120} />);
    return { ...r, frame: () => r.lastFrame() ?? '' };
  }

  it('band off: no edge, no cursor block, presence ignored; frame matches the default', async () => {
    const plain = startBand();
    const off = startBand({ band: false, modules: [echo, withPresence('web', () => 'live')] });
    plain.stdin.write('abc');
    off.stdin.write('abc');
    await tick();
    expect(off.frame()).toBe(plain.frame());
    expect(off.frame()).not.toContain(EDGE);
    expect(off.frame()).not.toContain('█');
    expect(off.frame()).not.toContain('web');
  });

  it('band on: edge on the input rows and a cursor block', async () => {
    const app = startBand({ band: true });
    app.stdin.write('abc');
    await tick();
    const rows = app
      .frame()
      .split('\n')
      .filter((l) => l.includes(EDGE));
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(app.frame()).toContain('abc█');
  });

  it('band on: a blank row between input and presence, and between the band and the status row', async () => {
    const app = startBand({ band: true, modules: [echo, withPresence('web', () => 'live')] });
    app.stdin.write('abc');
    await tick();
    const lines = app.frame().split('\n');
    const input = lines.findIndex((l) => l.includes('abc█'));
    const presence = lines.findIndex((l) => l.includes('web'));
    expect(presence - input).toBe(2);
    expect(lines[input + 1]?.replace(EDGE, '').trim()).toBe('');
    const lastEdge = lines.map((l) => l.includes(EDGE)).lastIndexOf(true);
    expect(lastEdge).toBe(presence + 1);
    expect(lines[lastEdge + 1]?.trim()).toBe('');
  });

  it('band on: no prompt glyph, only the edge and the block cursor', async () => {
    const app = startBand({ band: true });
    app.stdin.write('abc');
    await tick();
    const line =
      app
        .frame()
        .split('\n')
        .find((l) => l.includes('abc█')) ?? '';
    expect(line).not.toContain(defaultTheme.glyph.prompt);
    expect(line.replace(EDGE, '').trim()).toBe('abc█');
  });

  it('band on: a character under the cursor stays visible', async () => {
    const app = startBand({ band: true });
    app.stdin.write('abc');
    app.stdin.write('\u001B[D');
    await tick();
    expect(app.frame()).toContain('abc');
    expect(app.frame()).not.toContain('█');
  });

  it('renders the presence name and view', async () => {
    const app = startBand({
      band: true,
      modules: [echo, withPresence('web', () => 'live · main')]
    });
    await tick();
    expect(app.frame()).toContain('web');
    expect(app.frame()).toContain('live · main');
  });

  it('the exit hint shows in the notice on the first ctrl+c and not in a toast', async () => {
    const app = startBand({ band: true, modules: [echo, withPresence('web')] });
    app.stdin.write('\u0003');
    await tick();
    const line = app
      .frame()
      .split('\n')
      .find((l) => l.includes('press ctrl+c again'));
    expect(line).toBeDefined();
    expect(line).toContain('web');
    expect(line).toContain(EDGE);
  });

  it('the notice clears after its window', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    try {
      const { App } = createApp({ theme: defaultTheme, modules: [echo], band: true });
      const r = render(<App columns={120} />);
      r.stdin.write('\u0003');
      await vi.advanceTimersByTimeAsync(50);
      expect(r.lastFrame()).toContain('press ctrl+c again');
      await vi.advanceTimersByTimeAsync(CTRL_C_WINDOW_MS + 100);
      await vi.advanceTimersByTimeAsync(100);
      expect(r.lastFrame()).not.toContain('press ctrl+c again');
      r.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('two presence modules do not compose', () => {
    const a = defineModule('fixture.pa', { presence: { name: 'a' } });
    const b = defineModule('fixture.pb', { presence: { name: 'b' } });
    expect(() => assertComposes([a, b])).toThrow(/fixture\.pa.*fixture\.pb/s);
  });

  it('band on with no presence still renders the notice row', async () => {
    const app = startBand({ band: true });
    app.stdin.write('\u0003');
    await tick();
    expect(app.frame()).toContain('press ctrl+c again to exit');
  });

  it('sanitises the presence name', async () => {
    const app = startBand({
      band: true,
      modules: [echo, withPresence('w\u001b]0;pwned\u0007eb')]
    });
    await tick();
    expect(app.frame()).not.toContain('pwned');
    expect(app.frame()).not.toContain('\u001b]');
    expect(app.frame()).toContain('web');
  });

  it.each([44, 34])('row height is stable at %i columns', async (width) => {
    const { App } = createApp({
      theme: defaultTheme,
      modules: [echo, withPresence('c o d a', () => '  deliberating over a long thought')],
      band: true
    });
    const r = render(
      <Box width={width}>
        <App columns={width} />
      </Box>
    );
    await tick();
    const before = (r.lastFrame() ?? '').split('\n').length;
    r.stdin.write('\u0003');
    await tick();
    expect((r.lastFrame() ?? '').split('\n').length).toBe(before);
    expect(r.lastFrame()).toContain('press ctrl+c again to exit');
  });

  it('row height is stable when the notice appears', async () => {
    const app = startBand({ band: true, modules: [echo, withPresence('web', () => 'live')] });
    await tick();
    const before = app.frame().split('\n').length;
    app.stdin.write('\u0003');
    await tick();
    expect(app.frame().split('\n').length).toBe(before);
  });
});

describe('panel and renderer size', () => {
  const sized = defineModule<{ room: Record<string, never> }>('fixture.size', {
    commands: [{ name: 'room', summary: 's', args: [], run: (_, ctx) => ctx.open('room', {}) }],
    panels: {
      room: {
        view: ({ size }) => `ROOM ${size.columns}x${size.rows}`,
        keymap: [{ key: 'p', act: 'probe' }],
        on: {
          probe: (_s, ctx) => {
            const c = ctx.size();
            ctx.print(`CTX ${c.columns}x${c.rows}`);
            return undefined;
          }
        }
      }
    },
    turns: [
      {
        id: 'width',
        claims: (t) => (t === 'width' ? 2 : false),
        async *answer() {
          yield { phase: 'final', reply: { kind: 'fixture.width', data: null } };
        }
      }
    ],
    renderers: { 'fixture.width': ({ size }) => `WIDTH ${size.columns}` }
  });
  const mount = (props: { columns?: number; rows?: number }, panelRows?: (r: number) => number) => {
    const { App } = createApp({
      theme: defaultTheme,
      modules: [echo, panels, sized],
      railMinColumns: 80,
      ...(panelRows === undefined ? {} : { panelRows })
    });
    const r = render(<App {...props} />);
    return { ...r, frame: () => r.lastFrame() ?? '' };
  };
  const open = async (app: ReturnType<typeof mount>) => {
    app.stdin.write('/room');
    app.stdin.write(ENTER);
    await until(() => expect(app.frame()).toContain('ROOM'));
  };

  it('a panel gets the columns left beside the rail, and the default rows', async () => {
    const wide = mount({ columns: 120, rows: 40 });
    await open(wide);
    expect(wide.frame()).toContain('ROOM 79x32');
    const narrow = mount({ columns: 70, rows: 40 });
    await open(narrow);
    expect(narrow.frame()).toContain('ROOM 62x32');
  });

  it('AppOptions.panelRows sets the rows a panel may use', async () => {
    const app = mount({ columns: 120, rows: 40 }, (r) => r - 14);
    await open(app);
    expect(app.frame()).toContain('ROOM 79x24');
  });

  it('ctx.size() in an act is the size the view was given', async () => {
    const app = mount({ columns: 120, rows: 40 });
    await open(app);
    app.stdin.write('p');
    await tick();
    expect(app.frame()).toContain('CTX 79x32');
  });

  it('a renderer gets the width its reply prints at', async () => {
    const app = mount({ columns: 120, rows: 40 });
    app.stdin.write('width');
    app.stdin.write(ENTER);
    await tick(60);
    expect(app.frame()).toContain('WIDTH 120');
  });

  it('a resize re-renders the open panel at the new size', async () => {
    const app = mount({});
    await open(app);
    // The test stdout is 100 columns with no rows, so 30 rows by default.
    expect(app.frame()).toContain('ROOM 59x22');
    Object.defineProperty(app.stdout, 'columns', { value: 90, configurable: true });
    app.stdout.emit('resize');
    await until(() => expect(app.frame()).toContain('ROOM 49x22'));
  });

  it('band takes 5 more rows from the panel by default', async () => {
    const mk = (band: boolean) => {
      const { App } = createApp({
        theme: defaultTheme,
        modules: [echo, panels, sized],
        railMinColumns: 80,
        ...(band ? { band } : {})
      });
      const r = render(<App columns={120} rows={30} />);
      return { ...r, frame: () => r.lastFrame() ?? '' };
    };
    const off = mk(false);
    await open(off as ReturnType<typeof mount>);
    const on = mk(true);
    await open(on as ReturnType<typeof mount>);
    expect(off.frame()).toContain('ROOM 79x22');
    expect(on.frame()).toContain('ROOM 79x17');
  });

  it('gutter takes its columns off both sides of the panel; invalid values mean 0', async () => {
    const mk = (gutter: number) => {
      const { App } = createApp({
        theme: defaultTheme,
        modules: [echo, panels, sized],
        railMinColumns: 80,
        gutter
      });
      const r = render(<App columns={120} rows={30} />);
      return { ...r, frame: () => r.lastFrame() ?? '' };
    };
    const two = mk(2);
    await open(two as ReturnType<typeof mount>);
    expect(two.frame()).toContain('ROOM 75x22');
    for (const bad of [9, -1, 1.5]) {
      const app = mk(bad);
      await open(app as ReturnType<typeof mount>);
      expect(app.frame()).toContain('ROOM 79x22');
    }
  });

  it('gutter insets the transcript, the band and the status row', async () => {
    const { App } = createApp({ theme: defaultTheme, modules: [echo], band: true, gutter: 2 });
    const r = render(<App columns={80} />);
    r.stdin.write('hello');
    r.stdin.write('\r');
    await tick(80);
    const lines = (r.lastFrame() ?? '').split('\n').filter((l) => l.trim() !== '');
    expect(lines.length).toBeGreaterThan(3);
    for (const l of lines) expect(l.startsWith('  ')).toBe(true);
    expect(lines.some((l) => l.includes('┃'))).toBe(true);
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(78);
  });
});

describe('reading the conversation and saying an unprompted line', () => {
  /** A module that hands its ctx to the test, and a command that prints and reads at once. */
  function probe() {
    const got: { ctx?: Ctx; seen?: unknown } = {};
    const m = defineModule('fixture.reader', {
      init: (ctx: Ctx) => {
        got.ctx = ctx;
        return undefined;
      },
      commands: [
        {
          name: 'printread',
          summary: 'print, then read the last entry',
          args: [],
          run: (_, ctx) => {
            ctx.print('just printed');
            got.seen = ctx.transcript().committed.at(-1);
          }
        }
      ]
    });
    const { App } = createApp({ theme: defaultTheme, modules: [echo, m] });
    const r = render(<App columns={120} />);
    return { ...r, got, ctx: () => got.ctx as Ctx };
  }

  it('finds the last answer, and an answer by its mark', async () => {
    const r = probe();
    r.stdin.write('slow first');
    r.stdin.write(ENTER);
    r.stdin.write('quick');
    r.stdin.write(ENTER);
    await tick();
    releaseSlow();
    await tick();
    const t = r.ctx().transcript();
    expect(answerEntry(t, null)?.question).toBe('slow first');
    const marked = t.committed.filter((e) => e.kind === 'answer' && e.mark !== null);
    expect(marked.length).toBeGreaterThan(0);
    for (const e of marked) {
      if (e.kind === 'answer' && e.mark !== null) expect(answerEntry(t, e.mark)).toBe(e);
    }
  });

  it('a command that prints and then reads sees its own line', async () => {
    const r = probe();
    r.stdin.write('/printread');
    r.stdin.write(ENTER);
    await tick();
    expect(r.got.seen).toMatchObject({ kind: 'note', text: 'just printed' });
  });

  it('a held turn is a flight until it lands', async () => {
    const r = probe();
    r.stdin.write('slow held');
    r.stdin.write(ENTER);
    await tick(20);
    const held = r.ctx().transcript().flights;
    expect(held.map((f) => f.question)).toEqual(['slow held']);
    releaseSlow();
    await tick();
    expect(r.ctx().transcript().flights).toEqual([]);
  });

  it('say commits her unprompted line, drawn by its renderer, with no mark', async () => {
    const r = probe();
    await tick();
    r.ctx().say({ kind: 'fixture.text', data: 'hello, I was thinking about you' });
    await tick();
    expect(r.lastFrame()).toContain('hello, I was thinking about you');
    expect(r.lastFrame()).not.toContain('↩');
    const t = r.ctx().transcript();
    const last = t.committed.at(-1);
    expect(last).toMatchObject({ kind: 'answer', question: '', mark: null, unprompted: true });
    expect(typeof (last as { at?: number }).at).toBe('number');
    expect(answerEntry(t, null)).toBe(last);
  });

  it('say does nothing once the app has gone', async () => {
    const r = probe();
    await tick();
    const ctx = r.ctx();
    const before = ctx.transcript();
    r.unmount();
    ctx.say({ kind: 'fixture.text', data: 'too late' });
    expect(ctx.transcript()).toBe(before);
  });
});

describe('turn context: what a turn is shown as, its emphasis and context, its id', () => {
  const UP = '\u001B[A';
  /** A handler that records what it was given and holds the turn until released. */
  function recorder() {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const got: { ctx?: Ctx; calls: { text: string; turn: TurnContext }[]; claimed: string[] } = {
      calls: [],
      claimed: []
    };
    const m = defineModule('fixture.turnctx', {
      init: (ctx: Ctx) => {
        got.ctx = ctx;
        return undefined;
      },
      commands: [
        {
          name: 'pick',
          summary: 'send her question back with a reading',
          args: [],
          run: (_, ctx) =>
            ctx.submit('her own question', {
              shown: 'Looking up Burial',
              emphasis: 'Burial',
              context: { reading: 2 }
            })
        },
        {
          name: 'send',
          summary: 'submit a plain line',
          args: [],
          run: (_, ctx) => ctx.submit('module line')
        }
      ],
      turns: [
        {
          id: 'rec',
          claims: (t) => {
            got.claimed.push(t);
            return 5;
          },
          async *answer(text, _ctx, _signal, turn) {
            got.calls.push({ text, turn });
            await gate;
            yield {
              phase: 'final' as const,
              reply: { kind: 'fixture.turnctx', data: `got ${text}` }
            };
          }
        }
      ],
      renderers: { 'fixture.turnctx': ({ data }) => String(data) }
    });
    const { App } = createApp({ theme: defaultTheme, modules: [m] });
    const r = render(<App columns={120} />);
    return { ...r, got, release: () => release(), ctx: () => got.ctx as Ctx };
  }

  it('a typed line is its own ask: { id, shown }, and the id is its flight’s', async () => {
    const r = recorder();
    r.stdin.write('hello');
    r.stdin.write(ENTER);
    await tick();
    expect(r.got.calls).toHaveLength(1);
    const call = r.got.calls[0];
    expect(call?.text).toBe('hello');
    expect(call?.turn).toEqual({ id: call?.turn.id, shown: 'hello' });
    expect(
      r
        .ctx()
        .transcript()
        .flights.map((f) => f.id)
    ).toEqual([call?.turn.id]);
    r.release();
    await tick();
    expect(r.ctx().transcript().flights).toEqual([]);
  });

  it('a submitted turn prints what it is shown and sends its text, emphasis and context', async () => {
    const r = recorder();
    r.stdin.write('/pick');
    r.stdin.write(ENTER);
    await tick();
    expect(r.got.calls[0]).toMatchObject({
      text: 'her own question',
      turn: { shown: 'Looking up Burial', emphasis: 'Burial', context: { reading: 2 } }
    });
    expect(r.got.claimed).toContain('her own question');
    expect(r.got.claimed).not.toContain('Looking up Burial');
    expect(r.lastFrame()).toContain('Looking up Burial');
    expect(r.lastFrame()).not.toContain('her own question');
    r.release();
    await tick();
    const ask = r
      .ctx()
      .transcript()
      .committed.find((e) => e.kind === 'ask');
    expect(ask).toMatchObject({ question: 'Looking up Burial', emphasis: 'Burial' });
  });

  it('a line a module submits stays out of the history; a typed one joins it', async () => {
    const r = recorder();
    r.release();
    r.stdin.write('typed line');
    r.stdin.write(ENTER);
    await tick();
    r.stdin.write('/send');
    r.stdin.write(ENTER);
    await tick();
    // Each ask is echoed once in the transcript; the line the arrow recalls shows a second time.
    const count = (line: string) => (r.lastFrame() ?? '').split(line).length - 1;
    expect(count('› module line')).toBe(1);
    r.stdin.write(UP);
    await tick();
    expect(count('› typed line')).toBe(2);
    expect(count('› module line')).toBe(1);
  });

  it('a line a module submits with remember joins the history, and stays off the turn', async () => {
    const r = recorder();
    r.release();
    r.ctx().submit('forwarded line', { remember: true });
    await tick();
    expect(r.got.calls[0]?.turn).not.toHaveProperty('remember');
    const count = (line: string) => (r.lastFrame() ?? '').split(line).length - 1;
    r.stdin.write(UP);
    await tick();
    expect(count('› forwarded line')).toBe(2);
  });
});

describe('the app draws its own ask and answer frames', () => {
  const ask = ({ entry, held }: AskViewProps) =>
    `ASK[${held ? 'held' : 'done'}] ${entry.question} em=${entry.emphasis ?? '-'}`;
  const answer = ({ entry, body }: AnswerViewProps) => (
    <Box flexDirection="column">
      <Text>{`FRAME mark=${String(entry.mark)} unprompted=${String(entry.unprompted === true)}`}</Text>
      {body}
    </Box>
  );
  function framed(entries: NonNullable<Parameters<typeof createApp>[0]['entries']>) {
    const got: { ctx?: Ctx } = {};
    const m = defineModule('fixture.chrome', {
      init: (ctx: Ctx) => {
        got.ctx = ctx;
        return undefined;
      },
      commands: [
        {
          name: 'pick',
          summary: 's',
          args: [],
          run: (_, ctx) =>
            ctx.submit('slow pick', { shown: 'Looking up Burial', emphasis: 'Burial' })
        }
      ]
    });
    const { App } = createApp({ theme: defaultTheme, modules: [echo, m], entries });
    const r = render(<App columns={120} />);
    return { ...r, ctx: () => got.ctx as Ctx };
  }

  it('the ask view draws held and committed asks, emphasis included, in place of the echo', async () => {
    const r = framed({ ask });
    r.stdin.write('/pick');
    r.stdin.write(ENTER);
    await tick(20);
    expect(r.lastFrame()).toContain('ASK[held] Looking up Burial em=Burial');
    releaseSlow();
    await tick();
    expect(r.lastFrame()).toContain('ASK[done] Looking up Burial em=Burial');
    expect(r.lastFrame()).not.toContain('› Looking up Burial');
  });

  it('the answer view frames the body, and sees the mark and an unprompted line', async () => {
    const r = framed({ answer });
    r.stdin.write('slow first');
    r.stdin.write(ENTER);
    r.stdin.write('quick');
    r.stdin.write(ENTER);
    await tick();
    releaseSlow();
    await tick();
    const frame = r.lastFrame() ?? '';
    expect(frame).toContain('echo: quick');
    expect(frame).toMatch(/FRAME mark=\d+ unprompted=false/);
    expect(frame).not.toContain('↩');
    r.ctx().say({ kind: 'fixture.text', data: 'her own line' });
    await tick();
    expect(r.lastFrame()).toContain('FRAME mark=null unprompted=true');
    expect(r.lastFrame()).toContain('her own line');
  });

  it('a view that throws is reported by name, and the app lives', async () => {
    const r = framed({
      ask: () => {
        throw new Error('ask exploded');
      }
    });
    r.stdin.write('hi');
    r.stdin.write(ENTER);
    await tick(80);
    expect(r.lastFrame()).toContain('app view failed');
    expect(r.lastFrame()).toContain('echo: hi');
  });
});
