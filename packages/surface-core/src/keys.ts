import type { Registry } from './compose.js';
import type { Key, KeySpec } from './module.js';

export function keySpecOf(k: Key): KeySpec | null {
  if (k.escape) return 'escape';
  if (k.return) return 'enter';
  if (k.tab) return 'tab';
  if (k.upArrow) return 'up';
  if (k.downArrow) return 'down';
  if (k.leftArrow) return 'left';
  if (k.rightArrow) return 'right';
  if (k.pageUp) return 'pageup';
  if (k.pageDown) return 'pagedown';
  if (k.home) return 'home';
  if (k.end) return 'end';
  if (k.backspace) return 'backspace';
  if (k.delete) return 'delete';
  if (k.ctrl) return `ctrl+${k.input.toLowerCase()}`;
  if (k.meta) return `meta+${k.input.toLowerCase()}`;
  return [...k.input].length === 1 ? k.input : null;
}

export interface KeyState {
  readonly overlay: { readonly module: string; readonly panel: string } | null;
  readonly menu: 'palette' | 'completion' | null;
  readonly draftEmpty: boolean;
  /** The focused panel's armed confirm key, set only while the draft is exactly it. */
  readonly armed?: string | null;
}

export type Route =
  | { readonly kind: 'exit-chord' }
  | { readonly kind: 'menu'; readonly act: 'move'; readonly delta: -1 | 1 }
  | { readonly kind: 'menu'; readonly act: 'accept' | 'run' | 'close' }
  | {
      readonly kind: 'panel';
      readonly module: string;
      readonly panel: string;
      readonly act: string;
    }
  | { readonly kind: 'panel-close' }
  /** Enter on an armed confirm key: run the act and clear the draft. */
  | {
      readonly kind: 'confirm';
      readonly module: string;
      readonly panel: string;
      readonly act: string;
    }
  | { readonly kind: 'global'; readonly module: string; readonly key: KeySpec }
  | { readonly kind: 'cancel-turn' }
  | { readonly kind: 'history'; readonly dir: 'up' | 'down' }
  | { readonly kind: 'submit' }
  | { readonly kind: 'complete' }
  | { readonly kind: 'edit' }
  | { readonly kind: 'ignore' };

/** Pure: a key resolves to data, and only then does a handler run. Precedence per spec §3. */
export function resolveKey(state: KeyState, key: Key, registry: Registry): Route {
  const spec = keySpecOf(key);
  const focused =
    state.overlay === null
      ? undefined
      : registry.panels.get(`${state.overlay.module}/${state.overlay.panel}`);
  // A panel that confirms letters or owns the input line keeps the draft live.
  const live = (focused?.def.confirm?.length ?? 0) > 0 || focused?.def.submit !== undefined;
  if (spec === null) {
    // A multi-character chunk behind an open panel is the panel's to ignore, never the draft's,
    // unless the panel keeps the draft live.
    return state.menu === null && state.overlay !== null && !live
      ? { kind: 'ignore' }
      : { kind: 'edit' };
  }
  if (spec === 'ctrl+c') return { kind: 'exit-chord' };

  if (state.menu !== null) {
    if (spec === 'up') return { kind: 'menu', act: 'move', delta: -1 };
    if (spec === 'down') return { kind: 'menu', act: 'move', delta: 1 };
    if (spec === 'tab') return { kind: 'menu', act: 'accept' };
    if (spec === 'enter') return { kind: 'menu', act: state.menu === 'palette' ? 'run' : 'accept' };
    if (spec === 'escape') return { kind: 'menu', act: 'close' };
    return { kind: 'edit' };
  }

  if (state.overlay !== null) {
    if (spec === 'escape') return { kind: 'panel-close' };
    const hit = focused?.def.keymap?.find((b) => b.key === spec);
    if (hit)
      return {
        kind: 'panel',
        module: state.overlay.module,
        panel: state.overlay.panel,
        act: hit.act
      };
    const g = registry.globals.get(spec);
    if (g) return { kind: 'global', module: g.module, key: spec };
    if (!live) return { kind: 'ignore' };
    if (spec === 'enter') {
      const armed = focused?.def.confirm?.find((c) => c.key === state.armed);
      return armed === undefined
        ? { kind: 'submit' }
        : {
            kind: 'confirm',
            module: state.overlay.module,
            panel: state.overlay.panel,
            act: armed.act
          };
    }
    // Every other key reaches the draft, as with no panel open.
  }

  const global = registry.globals.get(spec);
  if (global) return { kind: 'global', module: global.module, key: spec };

  if (spec === 'escape') return state.draftEmpty ? { kind: 'cancel-turn' } : { kind: 'ignore' };
  if (spec === 'up') return { kind: 'history', dir: 'up' };
  if (spec === 'down') return { kind: 'history', dir: 'down' };
  if (spec === 'enter') return { kind: 'submit' };
  if (spec === 'tab') return { kind: 'complete' };
  return { kind: 'edit' };
}
