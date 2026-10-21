import { defaultTheme } from '@mnmal-ai/surface-theme';
import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';
import { createApp, defineModule, type ModuleCtx } from '../src/index.js';
import { echo, panels as hello } from './fixture.js';

const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const ENTER = '\r';
const ESC = '\u001B';
const TAB = '\t';
const UP = '\u001B[A';

const complete = vi.fn(() => []);
// Every line any vault panel's submit was handed, and the vault's ctx for module-driven opens.
const seen: string[] = [];
let vaultCtx: ModuleCtx<{
  pass: { got: string[] };
  once: Record<string, never>;
  other: Record<string, never>;
}> | null = null;
let senderCtx: ModuleCtx<Record<string, never>> | null = null;
const sender = defineModule('fixture.sender', {
  init: (ctx) => {
    senderCtx = ctx;
  }
});
const vault = defineModule<{
  pass: { got: string[] };
  once: Record<string, never>;
  other: Record<string, never>;
}>('fixture.vault', {
  init: (ctx) => {
    vaultCtx = ctx;
  },
  commands: [
    {
      name: 'unlock',
      summary: 'open the vault',
      args: [],
      run: (_, ctx) => ctx.open('pass', { got: [] })
    },
    {
      name: 'secret',
      summary: 'must not run',
      args: [],
      run: (_, ctx) => ctx.print('SECRET-COMMAND-RAN')
    }
  ],
  completers: [{ id: 'spy', complete }],
  panels: {
    pass: {
      view: ({ state }) => `PASS ${state.got.length}`,
      mask: true,
      submit: (s, line) => {
        seen.push(line);
        return { got: [...s.got, line] };
      },
      keymap: [
        { key: 'ctrl+x', act: 'shut' },
        { key: 'ctrl+o', act: 'swap' }
      ],
      on: {
        shut: (_s, ctx) => {
          ctx.close();
          return undefined;
        },
        swap: (_s, ctx) => {
          ctx.open('other', {});
          return undefined;
        }
      }
    },
    // A masked panel whose submit takes one line and closes.
    once: {
      view: () => 'ONCE',
      mask: true,
      submit: (_s, line, ctx) => {
        seen.push(line);
        ctx.close();
        return undefined;
      }
    },
    other: { view: () => 'OTHER' }
  }
});

function start() {
  seen.length = 0;
  const { App } = createApp({ theme: defaultTheme, modules: [echo, hello, sender, vault] });
  const r = render(<App columns={120} />);
  return { ...r, frame: () => r.lastFrame() ?? '' };
}

async function unlocked() {
  const app = start();
  app.stdin.write('/unlock');
  await tick();
  app.stdin.write(ENTER);
  await tick();
  expect(app.frame()).toContain('PASS 0');
  return app;
}

describe('a masked panel (PanelDef.mask)', () => {
  it('1. draws typed characters as bullets, emoji as one', async () => {
    const app = await unlocked();
    app.stdin.write('hunter2😀');
    await tick();
    expect(app.frame()).toContain('••••••••');
    expect(app.frame()).not.toContain('•••••••••');
    expect(app.frame()).not.toContain('hunter2');
    app.unmount();
  });

  it('2. Enter hands the line to submit and it never reaches the transcript or history', async () => {
    const app = await unlocked();
    app.stdin.write('hunter2');
    app.stdin.write(ENTER);
    await tick();
    expect(app.frame()).toContain('PASS 1');
    expect(app.frame()).not.toContain('hunter2');
    app.stdin.write(ESC);
    await tick();
    app.stdin.write(UP);
    await tick();
    expect(app.frame()).not.toContain('hunter2');
    app.unmount();
  });

  it('3. a line starting with / goes to submit: no palette, no command', async () => {
    const app = await unlocked();
    app.stdin.write('/secret');
    await tick();
    expect(app.frame()).not.toContain('must not run');
    app.stdin.write(ENTER);
    await tick();
    expect(app.frame()).toContain('PASS 1');
    expect(app.frame()).not.toContain('SECRET-COMMAND-RAN');
    app.unmount();
  });

  it('4. Tab asks no completer', async () => {
    const app = await unlocked();
    app.stdin.write('abc');
    app.stdin.write(TAB);
    await tick();
    expect(complete).not.toHaveBeenCalled();
    app.unmount();
  });

  it('5. Up does not walk history into the secret line', async () => {
    const app = start();
    app.stdin.write('earlier');
    app.stdin.write(ENTER);
    await tick(60);
    app.stdin.write('/unlock');
    await tick();
    app.stdin.write(ENTER);
    await tick();
    app.stdin.write(UP);
    await tick();
    expect(app.frame()).not.toContain('•');
    app.unmount();
  });

  it('6. the draft is cleared when the panel closes by Escape', async () => {
    const app = await unlocked();
    app.stdin.write('hunter2');
    await tick();
    app.stdin.write(ESC);
    await tick();
    expect(app.frame()).not.toContain('PASS');
    expect(app.frame()).not.toContain('hunter2');
    expect(app.frame()).not.toContain('•');
    app.unmount();
  });

  it('6b. ctx.close() from the panel clears the masked draft too', async () => {
    const app = await unlocked();
    app.stdin.write('hunter2');
    await tick();
    app.stdin.write('\u0018'); // ctrl+x
    await tick();
    expect(app.frame()).not.toContain('PASS');
    expect(app.frame()).not.toContain('hunter2');
    expect(app.frame()).not.toContain('•');
    app.unmount();
  });

  it('6c. a panel act opening another panel of the same module clears the masked draft', async () => {
    const app = await unlocked();
    app.stdin.write('hunter2');
    await tick();
    app.stdin.write('\u000F'); // ctrl+o
    await tick();
    expect(app.frame()).toContain('OTHER');
    expect(app.frame()).not.toContain('•');
    expect(app.frame()).not.toContain('hunter2');
    app.stdin.write(ESC);
    await tick();
    expect(app.frame()).not.toContain('hunter2');
    expect(app.frame()).not.toContain('•');
    app.unmount();
  });

  it('6d. a masked panel opened by its module starts on an empty line: no inherited draft, menu or history walk', async () => {
    const app = start();
    app.stdin.write('/ga');
    await tick();
    expect(app.frame()).toContain('/ga');
    vaultCtx?.open('pass', { got: [] });
    await tick();
    expect(app.frame()).toContain('PASS 0');
    expect(app.frame()).not.toContain('/ga');
    expect(app.frame()).not.toContain('•');
    app.stdin.write(ENTER);
    await tick(60);
    expect(seen.some((l) => l.startsWith('/'))).toBe(false);
    app.unmount();
  });

  it('6d2. the open palette closes when a masked panel opens under it', async () => {
    const app = start();
    app.stdin.write('/he');
    await tick();
    expect(app.frame()).toContain('print a note');
    vaultCtx?.open('pass', { got: [] });
    await tick();
    expect(app.frame()).toContain('PASS 0');
    expect(app.frame()).not.toContain('print a note');
    app.stdin.write(ENTER);
    await tick(60);
    expect(app.frame()).not.toContain('hello from a command');
    expect(seen).toEqual(['']);
    app.unmount();
  });

  it('6e. an unbracketed chunk whose first line closes the masked panel drops the rest', async () => {
    const app = start();
    vaultCtx?.open('once', {});
    await tick();
    expect(app.frame()).toContain('ONCE');
    app.stdin.write('pw\rafter\r');
    await tick(60);
    expect(seen).toEqual(['pw']);
    expect(app.frame()).not.toContain('ONCE');
    expect(app.frame()).not.toContain('after');
    app.stdin.write(UP);
    await tick();
    expect(app.frame()).not.toContain('after');
    expect(app.frame()).not.toContain('pw');
    app.unmount();
  });

  it("6f. another module's ctx.submit('/hello') runs the command while a masked panel is focused", async () => {
    const app = await unlocked();
    senderCtx?.submit('/hello');
    await tick(60);
    expect(app.frame()).toContain('hello from a command');
    expect(seen).toEqual([]);
    expect(app.frame()).toContain('PASS 0');
    app.unmount();
  });

  it('7. a pasted secret stays masked and out of history', async () => {
    const app = await unlocked();
    app.stdin.write('\u001B[200~pasted-secret\u001B[201~');
    await tick();
    expect(app.frame()).not.toContain('pasted-secret');
    app.stdin.write(ENTER);
    await tick();
    expect(app.frame()).toContain('PASS 1');
    app.stdin.write(ESC);
    await tick();
    app.stdin.write(UP);
    await tick();
    expect(app.frame()).not.toContain('pasted-secret');
    app.unmount();
  });
});
