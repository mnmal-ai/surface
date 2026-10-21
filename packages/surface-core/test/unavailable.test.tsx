import { defaultTheme } from '@mnmal-ai/surface-theme';
import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import { createApp, defineModule } from '../src/index.js';
import { echo } from './fixture.js';

const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const ENTER = '\r';

let locked = true;
const gated = defineModule('fixture.gated', {
  commands: [
    {
      name: 'grant',
      summary: 'gated write',
      args: [],
      unavailable: () => (locked ? 'needs /admin unlock' : null),
      run: (_, ctx) => ctx.print('GRANT-RAN')
    },
    {
      name: 'broken',
      summary: 'thunk throws',
      args: [],
      unavailable: () => {
        throw new Error('boom');
      },
      run: (_, ctx) => ctx.print('BROKEN-RAN')
    },
    { name: 'gauge', summary: 'always on', args: [], run: (_, ctx) => ctx.print('GAUGE-RAN') }
  ]
});

function start() {
  const { App } = createApp({ theme: defaultTheme, modules: [echo, gated] });
  const r = render(<App columns={120} />);
  return { ...r, frame: () => r.lastFrame() ?? '' };
}

describe('a command that says it is unavailable (CommandSpec.unavailable)', () => {
  it('is left out of the palette while unavailable', async () => {
    locked = true;
    const app = start();
    app.stdin.write('/g');
    await tick();
    expect(app.frame()).toContain('gauge');
    expect(app.frame()).not.toContain('gated write');
    app.unmount();
  });

  it('typed in full, prints its reason instead of running or reading as unknown', async () => {
    locked = true;
    const app = start();
    app.stdin.write('/grant');
    app.stdin.write(ENTER);
    await tick();
    expect(app.frame()).toContain('/grant: needs /admin unlock');
    expect(app.frame()).not.toContain('GRANT-RAN');
    expect(app.frame()).not.toContain('unknown command');
    app.unmount();
  });

  it('appears and runs once available, read at the moment of use', async () => {
    locked = true;
    const app = start();
    locked = false;
    app.stdin.write('/gr');
    await tick();
    expect(app.frame()).toContain('gated write');
    app.stdin.write('ant');
    app.stdin.write(ENTER);
    await tick();
    expect(app.frame()).toContain('GRANT-RAN');
    app.unmount();
  });

  it('a thunk that throws counts as unavailable and does not break the palette', async () => {
    const app = start();
    app.stdin.write('/b');
    await tick();
    expect(app.frame()).not.toContain('thunk throws');
    app.stdin.write('roken');
    app.stdin.write(ENTER);
    await tick();
    expect(app.frame()).toContain('/broken: unavailable');
    expect(app.frame()).not.toContain('BROKEN-RAN');
    app.unmount();
  });
});
