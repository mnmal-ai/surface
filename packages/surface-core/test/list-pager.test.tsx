import type { ListRow, ListSpec } from '@mnmal-ai/surface-kit/list';
import { defaultTheme } from '@mnmal-ai/surface-theme';
import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import { createApp, defineModule, type ListHooks, listPager } from '../src/index.js';
import { panels } from './fixture.js';

const ENTER = '\r';
const ESC = '\u001B';
const DOWN = '\u001B[B';
const RIGHT = '\u001B[C';
const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));

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

const rows = (n: number): ListRow[] =>
  Array.from({ length: n }, (_, i) => ({
    key: `k${i + 1}`,
    name: `item-${i + 1}`,
    details: [i % 2 === 0 ? 'even' : 'odd']
  }));
const list = (n: number, extra: Partial<ListSpec> = {}): ListSpec => ({
  heading: 'open todos',
  rows: rows(n),
  ...extra
});

/** An app whose every question answers with `make()`'s list, through the pager. */
function start(make: () => { list: ListSpec; hooks?: ListHooks }, delayMs = 0) {
  const lp = listPager();
  const asker = defineModule('test.asker', {
    turns: [
      {
        id: 'ask',
        claims: () => 1,
        async *answer() {
          if (delayMs > 0) await tick(delayMs);
          const { list: l, hooks } = make();
          yield { phase: 'final', reply: lp.present(l, hooks) };
        }
      }
    ]
  });
  const { App } = createApp({ theme: defaultTheme, modules: [lp.module, asker, panels] });
  const r = render(<App columns={100} rows={40} />);
  const frame = () => r.lastFrame() ?? '';
  const send = async (s: string) => {
    r.stdin.write(s);
    await tick();
  };
  return { ...r, frame, send };
}

describe('a list as a reply', () => {
  it('ten rows print inline and open no pager', async () => {
    const t = start(() => ({ list: list(10) }));
    await t.send('q');
    await t.send(ENTER);
    await until(() => expect(t.frame()).toContain('item-10'));
    expect(t.frame()).not.toContain('📋 List');
  });

  it('eleven rows open the pager, and the transcript has only the heading and the pointer', async () => {
    const t = start(() => ({ list: list(11) }));
    await t.send('q');
    await t.send(ENTER);
    await until(() => expect(t.frame()).toContain('📋 List open todos'));
    expect(t.frame()).toContain('11 rows — in the list (/list)');
    // The rows appear once: in the pager.
    expect(t.frame().split('item-1 ').length - 1).toBeLessThanOrEqual(1);
  });

  it('a long list that lands while a panel is open prints its first ten rows inline', async () => {
    const t = start(() => ({ list: list(15) }), 150);
    await t.send('q');
    await t.send(ENTER);
    await t.send('/info');
    await t.send(ENTER);
    await until(() => expect(t.frame()).toContain('info count=0'));
    await until(() => expect(t.frame()).toContain('…and 5 more — /list to page through them'));
    expect(t.frame()).toContain('item-10');
    expect(t.frame()).not.toContain('📋 List');
  });

  it('a list with more matches than rows says how many in all', async () => {
    const t = start(() => ({ list: list(40, { total: 120 }) }));
    await t.send('q');
    await t.send(ENTER);
    await until(() => expect(t.frame()).toContain('40 rows — in the list (/list), 120 in all'));
    expect(t.frame()).toContain('40 of 120');
  });
});

describe('the pager', () => {
  it('↓ ↓ enter opens the third row; esc returns to the list on that row', async () => {
    const t = start(() => ({
      list: list(20),
      hooks: { open: (row) => ({ title: `DETAIL ${row.key}`, body: 'the body' }) }
    }));
    await t.send('q');
    await t.send(ENTER);
    await until(() => expect(t.frame()).toContain('📋 List'));
    await t.send(DOWN);
    await t.send(DOWN);
    await t.send(ENTER);
    await until(() => expect(t.frame()).toContain('DETAIL k3'));
    await t.send(ESC);
    await until(() => expect(t.frame()).toContain('📋 List'));
    await t.send(ENTER);
    await until(() => expect(t.frame()).toContain('DETAIL k3'));
  });

  it('an async open shows loading… then the detail; a rejected one shows its error', async () => {
    let fail = false;
    const t = start(() => ({
      list: list(20),
      hooks: {
        open: async (row) => {
          await tick(80);
          if (fail) throw new Error('fetch failed');
          return { title: `DETAIL ${row.key}` };
        }
      }
    }));
    await t.send('q');
    await t.send(ENTER);
    await until(() => expect(t.frame()).toContain('📋 List'));
    await t.send(ENTER);
    expect(t.frame()).toContain('loading…');
    await until(() => expect(t.frame()).toContain('DETAIL k1'));
    fail = true;
    await t.send(ESC);
    await t.send(ENTER);
    await until(() => expect(t.frame()).toContain('fetch failed'));
  });

  it('an open that resolves after the pager closed changes nothing', async () => {
    const t = start(() => ({
      list: list(20),
      hooks: {
        open: async (row) => {
          await tick(80);
          return { title: `DETAIL ${row.key}` };
        }
      }
    }));
    await t.send('q');
    await t.send(ENTER);
    await until(() => expect(t.frame()).toContain('📋 List'));
    await t.send(ENTER);
    await t.send(ESC);
    await t.send(ESC);
    await tick(150);
    expect(t.frame()).not.toContain('DETAIL');
    expect(t.frame()).not.toContain('📋 List');
  });

  it('/ then typing narrows the rows; r while filtering is typed, not related', async () => {
    let related = 0;
    const t = start(() => ({
      list: { heading: 'h', rows: [...rows(12), { key: 'x', name: 'pager row' }] },
      hooks: {
        related: () => {
          related += 1;
          return list(2);
        }
      }
    }));
    await t.send('q');
    await t.send(ENTER);
    await until(() => expect(t.frame()).toContain('📋 List'));
    await t.send('/');
    for (const ch of 'pager r') await t.send(ch);
    await until(() => expect(t.frame()).toContain('filter: pager r'));
    expect(related).toBe(0);
  });

  it('r shows the related list as a step; esc comes back', async () => {
    const t = start(() => ({
      list: list(20),
      hooks: { related: (row) => ({ heading: `related to ${row.key}`, rows: rows(3) }) }
    }));
    await t.send('q');
    await t.send(ENTER);
    await until(() => expect(t.frame()).toContain('📋 List open todos'));
    await t.send('r');
    await until(() => expect(t.frame()).toContain('📋 List related to k1'));
    await t.send(ESC);
    await until(() => expect(t.frame()).toContain('📋 List open todos'));
  });

  it('/list reopens the last long list on the page it was left on', async () => {
    const t = start(() => ({ list: list(40) }));
    await t.send('q');
    await t.send(ENTER);
    await until(() => expect(t.frame()).toContain('page 1 of'));
    await t.send(RIGHT);
    await until(() => expect(t.frame()).toContain('page 2 of'));
    await t.send(ESC);
    await until(() => expect(t.frame()).not.toContain('📋 List'));
    await t.send('/list');
    await t.send(ENTER);
    await until(() => expect(t.frame()).toContain('page 2 of'));
  });

  it('/list with no long list says so', async () => {
    const t = start(() => ({ list: list(3) }));
    await t.send('/list');
    await t.send(ENTER);
    await until(() => expect(t.frame()).toContain('nothing to page through'));
  });

  it('a list without hooks leaves enter open and r related out of the hint', async () => {
    const t = start(() => ({ list: list(20) }));
    await t.send('q');
    await t.send(ENTER);
    await until(() => expect(t.frame()).toContain('esc close'));
    expect(t.frame()).not.toContain('enter open');
    expect(t.frame()).not.toContain('r related');
  });

  it('a filter matching nothing says so, and enter does nothing', async () => {
    const t = start(() => ({
      list: list(20),
      hooks: { open: () => ({ title: 'DETAIL' }) }
    }));
    await t.send('q');
    await t.send(ENTER);
    await until(() => expect(t.frame()).toContain('📋 List'));
    await t.send('/');
    await t.send('z');
    await until(() => expect(t.frame()).toContain('no rows match z'));
    await t.send(ENTER);
    await t.send(ENTER);
    expect(t.frame()).not.toContain('DETAIL');
  });

  it('an answer that lands while an older list is paged is the one /list reopens', async () => {
    let n = 0;
    const t = start(() => {
      n += 1;
      return { list: { heading: `list ${n}`, rows: rows(15) } };
    }, 120);
    await t.send('q');
    await t.send(ENTER);
    await until(() => expect(t.frame()).toContain('📋 List list 1'));
    await t.send(ESC);
    // A slow question; while it runs, the operator reviews the older list.
    await t.send('q');
    await t.send(ENTER);
    await t.send('/list');
    await t.send(ENTER);
    await until(() => expect(t.frame()).toContain('📋 List list 1'));
    await until(() => expect(t.frame()).toContain('…and 5 more — /list to page through them'));
    await t.send(DOWN);
    await t.send(ESC);
    await until(() => expect(t.frame()).not.toContain('📋 List'));
    await t.send('/list');
    await t.send(ENTER);
    await until(() => expect(t.frame()).toContain('📋 List list 2'));
  });

  it('a related search that finds nothing says so, not that a filter matched nothing', async () => {
    const t = start(() => ({
      list: list(20),
      hooks: { related: () => ({ heading: 'related to k1', rows: [] }) }
    }));
    await t.send('q');
    await t.send(ENTER);
    await until(() => expect(t.frame()).toContain('📋 List open todos'));
    await t.send('r');
    await until(() => expect(t.frame()).toContain('📋 List related to k1'));
    expect(t.frame()).toContain('nothing here');
    expect(t.frame()).not.toContain('no rows match');
  });

  it('a pasted filter keeps to one clean line', async () => {
    const t = start(() => ({ list: list(20) }));
    await t.send('q');
    await t.send(ENTER);
    await until(() => expect(t.frame()).toContain('📋 List'));
    await t.send('/');
    await t.send('ev\nen\u001b[31m');
    // The line break became a space, and the colour escape left nothing behind.
    await until(() => expect(t.frame()).toContain('filter: ev en▌'));
    expect(t.frame()).not.toContain('[31m');
  });
});
