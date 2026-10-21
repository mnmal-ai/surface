import { describe, expect, it } from 'vitest';
import { assertComposes, CompositionError, composeModules } from '../src/compose.js';
import { defineModule } from '../src/module.js';

const a = defineModule<{ list: { n: number } }>('test.a', {
  commands: [{ name: 'alpha', summary: 'a', args: [], run: () => {} }],
  panels: { list: { view: () => null } },
  keymap: [{ key: 'ctrl+p', run: () => {} }],
  renderers: { 'test.a.reply': () => null }
});
const b = defineModule('test.b', {
  commands: [{ name: 'beta', summary: 'b', args: [], run: () => {} }],
  turns: [{ id: 'echo', claims: () => 1, async *answer() {} }]
});

describe('composeModules', () => {
  it('indexes every contribution by namespaced id', () => {
    const r = composeModules([a, b]);
    expect([...r.commands.keys()].sort()).toEqual(['alpha', 'beta']);
    expect([...r.panels.keys()]).toEqual(['test.a/list']);
    expect([...r.globals.keys()]).toEqual(['ctrl+p']);
    expect(r.turns.map((t) => `${t.module}:${t.handler.id}`)).toEqual(['test.b:echo']);
    expect([...r.renderers.keys()]).toEqual(['test.a.reply']);
  });

  it('reports every conflict at once', () => {
    const clash = defineModule('test.c', {
      commands: [{ name: 'alpha', summary: 'dup', args: [], run: () => {} }],
      keymap: [
        { key: 'ctrl+p', run: () => {} },
        { key: 'ctrl+c', run: () => {} }
      ],
      renderers: { 'test.a.reply': () => null }
    });
    try {
      composeModules([a, clash, a]);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(CompositionError);
      const p = (e as CompositionError).problems.join('\n');
      expect(p).toMatch(/module id 'test.a' is used twice/);
      expect(p).toMatch(/command '\/alpha'.*test.a.*test.c/);
      expect(p).toMatch(/global key 'ctrl\+p'.*test.a.*test.c/);
      expect(p).toMatch(/'ctrl\+c' is reserved/);
      expect(p).toMatch(/renderer 'test.a.reply'/);
    }
  });

  it('assertComposes is the one-line test apps use', () => {
    expect(() => assertComposes([a, b])).not.toThrow();
  });

  it('refuses a module id that is not lower-case dotted', () => {
    expect(() => defineModule('Bad Id', {})).toThrow(/lower-case dotted/);
  });

  it('refuses a second module that would register the same panel id', () => {
    const dup = defineModule<{ list: { n: number } }>('test.a', {
      panels: { list: { view: () => null } }
    });
    expect(() => composeModules([a, dup])).toThrow(/module id 'test.a' is used twice/);
  });

  it('refuses a reserved key on its own', () => {
    const m = defineModule('test.d', { keymap: [{ key: 'ctrl+c', run: () => {} }] });
    expect(() => assertComposes([m])).toThrow(/'ctrl\+c' is reserved/);
  });

  it('treats differently-cased key specs as the same key', () => {
    const x = defineModule('test.x', { keymap: [{ key: 'Ctrl+P', run: () => {} }] });
    expect(() => composeModules([a, x])).toThrow(/global key 'ctrl\+p'.*test.a.*test.x/);
  });

  it.each(['Ctrl+C', 'ESC', 'Return'])('treats %s as reserved', (key) => {
    const m = defineModule('test.r', { keymap: [{ key, run: () => {} }] });
    expect(() => assertComposes([m])).toThrow(/is reserved/);
  });

  it('names the module for an invalid key spec', () => {
    const m = defineModule('test.bad', { keymap: [{ key: 'ctrl+shift+p', run: () => {} }] });
    expect(() => assertComposes([m])).toThrow(/test\.bad: key spec 'ctrl\+shift\+p'/);
  });

  it('stores canonical keys for globals and panel keymaps without mutating the module', () => {
    const view = () => null;
    const m = defineModule<{ p: number }>('test.k', {
      panels: { p: { view, keymap: [{ key: 'PgUp', act: 'close' }] } },
      keymap: [
        { key: 'Ctrl+Y', run: () => {} },
        { key: 'Meta+P', run: () => {} }
      ]
    });
    const r = composeModules([m]);
    expect([...r.globals.keys()]).toEqual(['ctrl+y', 'meta+p']);
    expect(r.globals.get('ctrl+y')?.binding.key).toBe('ctrl+y');
    expect(r.panels.get('test.k/p')?.def.keymap?.[0]?.key).toBe('pageup');
    expect(m.panels?.p.keymap?.[0]?.key).toBe('PgUp');
  });

  it('refuses two turn handlers with the same id', () => {
    const t = { id: 'echo', claims: () => 1 as const, async *answer() {} };
    const m1 = defineModule('test.t1', { turns: [t, t] });
    const m2 = defineModule('test.t2', { turns: [t] });
    expect(() => composeModules([m1])).toThrow(/turn handler 'echo'/);
    expect(() => composeModules([b, m2])).toThrow(/turn handler 'echo'.*test.b.*test.t2/);
  });
});

describe('composition rejects silent bindings', () => {
  const panel = (keymap: { key: string; act: string }[]) =>
    defineModule<{ p: Record<string, never> }>('test.k', {
      panels: { p: { view: () => null, keymap } }
    });

  it('a panel binding on a reserved key', () => {
    expect(() => composeModules([panel([{ key: 'escape', act: 'x' }])])).toThrow(/reserved/);
  });
  it.each(['enter', 'Return', 'tab'])(
    'allows a panel to bind %s (only ctrl+c and escape precede a panel)',
    (key) => {
      expect(() => composeModules([panel([{ key, act: 'x' }])])).not.toThrow();
    }
  );
  it('a global on a single printable character', () => {
    const q = defineModule('test.q', { keymap: [{ key: 'q', run: () => {} }] });
    expect(() => composeModules([q])).toThrow(/untypeable/);
  });
  it('a duplicate key within one panel keymap', () => {
    const m = panel([
      { key: 'a', act: 'x' },
      { key: 'a', act: 'y' }
    ]);
    expect(() => composeModules([m])).toThrow(/binds 'a' twice/);
  });
});

describe('confirm keys (letter, then Enter)', () => {
  const review = (
    confirm: { key: string; act: string; label: string }[],
    keymap: { key: string; act: string }[] = []
  ) =>
    defineModule<{ r: Record<string, never> }>('test.r', {
      panels: { r: { view: () => null, keymap, confirm, on: { approve: () => undefined } } }
    });
  const approve = { key: 'a', act: 'approve', label: 'approves it' };

  it('compose when each is one printable key with a handler', () => {
    expect(() =>
      composeModules([review([approve], [{ key: 'down', act: 'approve' }])])
    ).not.toThrow();
  });
  it('rejects a key in both the keymap and confirm', () => {
    expect(() => composeModules([review([approve], [{ key: 'a', act: 'approve' }])])).toThrow(
      /both its keymap and confirm/
    );
  });
  it(
    'keeps a confirm key and a keymap binding distinct when they differ only in case, ' +
      'as a key event reports the character typed',
    () => {
      expect(() =>
        composeModules([review([approve], [{ key: 'A', act: 'approve' }])])
      ).not.toThrow();
    }
  );
  it.each(['ab', ' ', '', 'ctrl+a'])('rejects %j, which is not one printable character', (key) => {
    expect(() => composeModules([review([{ ...approve, key }])])).toThrow(
      /one printable character/
    );
  });
  it('rejects a confirm act with no handler, and a key confirmed twice', () => {
    expect(() => composeModules([review([{ ...approve, act: 'reject' }])])).toThrow(
      /no handler for/
    );
    expect(() => composeModules([review([approve, approve])])).toThrow(/confirms 'a' twice/);
  });
});

describe('an input panel', () => {
  const input = (withSubmit: boolean) =>
    defineModule<{ p: Record<string, never> }>('test.i', {
      panels: {
        p: {
          view: () => null,
          escape: () => undefined,
          ...(withSubmit ? { submit: () => undefined } : {})
        }
      }
    });
  it('may handle escape when it owns the input line', () => {
    expect(() => composeModules([input(true)])).not.toThrow();
  });
  it('may not handle escape otherwise: esc must always close it', () => {
    expect(() => composeModules([input(false)])).toThrow(/escape without submit/);
  });
  it('refuses mask without submit', () => {
    const m = defineModule<{ p: Record<string, never> }>('test.m', {
      panels: { p: { view: () => null, mask: true } }
    });
    expect(() => composeModules([m])).toThrow(/masks its input without submit/);
  });
  it('refuses mask with confirm keys: they would arm on a secret', () => {
    const m = defineModule<{ p: Record<string, never> }>('test.m', {
      panels: {
        p: {
          view: () => null,
          mask: true,
          submit: () => undefined,
          confirm: [{ key: 'y', act: 'go', label: 'go' }],
          on: { go: () => undefined }
        }
      }
    });
    expect(() => composeModules([m])).toThrow(
      /test\.m\/p masks its input but declares confirm keys/
    );
  });
  it('refuses a printable single-character key on a masked panel; ctrl and named keys stay allowed', () => {
    const masked = (key: string) =>
      defineModule<{ p: Record<string, never> }>('test.m', {
        panels: {
          p: {
            view: () => null,
            mask: true,
            submit: () => undefined,
            keymap: [{ key, act: 'a' }],
            on: { a: () => undefined }
          }
        }
      });
    for (const key of ['x', '+', 'space']) {
      expect(() => composeModules([masked(key)])).toThrow(
        /masks its input but binds .*untypeable in the secret/
      );
    }
    for (const key of ['ctrl+x', 'meta+k', 'up', 'pagedown']) {
      expect(() => composeModules([masked(key)])).not.toThrow();
    }
  });
});
