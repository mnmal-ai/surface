import { normaliseKeySpec } from './key-spec.js';
import type {
  CommandSpec,
  Completer,
  GlobalBinding,
  PanelDef,
  PresenceSpec,
  RailItem,
  Renderer,
  TuiModule,
  TurnHandler
} from './module.js';

// The registry erases each module's panel-map type: the core only routes, never inspects state.
// biome-ignore lint/suspicious/noExplicitAny: erased per-module panel maps
type AnyModule = TuiModule<any>;

export interface Registry {
  readonly modules: readonly AnyModule[];
  readonly commands: ReadonlyMap<string, { module: string; spec: CommandSpec<unknown> }>;
  readonly panels: ReadonlyMap<
    string,
    { module: string; panel: string; def: PanelDef<unknown, unknown> }
  >;
  readonly globals: ReadonlyMap<string, { module: string; binding: GlobalBinding<unknown> }>;
  readonly completers: readonly { module: string; completer: Completer }[];
  readonly turns: readonly { module: string; handler: TurnHandler<unknown> }[];
  readonly renderers: ReadonlyMap<string, { module: string; render: Renderer }>;
  readonly rail: readonly { module: string; item: RailItem }[];
  readonly status: readonly { module: string; item: RailItem }[];
  readonly presence?: { readonly module: string; readonly spec: PresenceSpec };
}

/** Keys a module may not bind globally: the exit chord, submit, cancel, complete. */
export const RESERVED_GLOBAL_KEYS: readonly string[] = ['ctrl+c', 'enter', 'escape', 'tab'];

/** Keys a panel may not bind: only these are taken before a focused panel's keymap (keys.ts). */
export const RESERVED_PANEL_KEYS: readonly string[] = ['ctrl+c', 'escape'];

/** One printable character: what a confirm key must be, since it is typed into the draft. */
const PRINTABLE = /^[^\p{C}\s]$/u;

export class CompositionError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`modules do not compose:\n  ${problems.join('\n  ')}`);
    this.name = 'CompositionError';
  }
}

export function composeModules(modules: readonly AnyModule[]): Registry {
  const problems: string[] = [];
  const ids = new Set<string>();
  const turnIds = new Map<string, string>();
  const commands = new Map<string, { module: string; spec: CommandSpec<unknown> }>();
  const panels = new Map<
    string,
    { module: string; panel: string; def: PanelDef<unknown, unknown> }
  >();
  const globals = new Map<string, { module: string; binding: GlobalBinding<unknown> }>();
  const renderers = new Map<string, { module: string; render: Renderer }>();
  const completers: { module: string; completer: Completer }[] = [];
  const turns: { module: string; handler: TurnHandler<unknown> }[] = [];
  const rail: { module: string; item: RailItem }[] = [];
  const status: { module: string; item: RailItem }[] = [];

  let presence: { module: string; spec: PresenceSpec } | undefined;

  for (const m of modules) {
    if (ids.has(m.id)) {
      problems.push(`module id '${m.id}' is used twice`);
      continue;
    }
    ids.add(m.id);
    for (const c of m.commands ?? []) {
      const prior = commands.get(c.name);
      if (prior) problems.push(`command '/${c.name}' is registered by ${prior.module} and ${m.id}`);
      else commands.set(c.name, { module: m.id, spec: c as CommandSpec<unknown> });
    }
    const canon = (spec: string): string | undefined => {
      try {
        return normaliseKeySpec(spec);
      } catch (e) {
        problems.push(`${m.id}: ${(e as Error).message}`);
        return undefined;
      }
    };
    for (const [panel, rawDef] of Object.entries(m.panels ?? {})) {
      const key = `${m.id}/${panel}`;
      const def = rawDef as PanelDef<unknown, unknown>;
      const seen = new Set<string>();
      const keymap = def.keymap?.flatMap((k) => {
        const c = canon(k.key);
        if (c === undefined) return [];
        if (RESERVED_PANEL_KEYS.includes(c)) {
          problems.push(`${key} binds '${k.key}', but '${c}' is reserved by the core`);
          return [];
        }
        if (seen.has(c)) {
          problems.push(`${key} binds '${c}' twice`);
          return [];
        }
        seen.add(c);
        return [{ ...k, key: c }];
      });
      const bound = new Set((keymap ?? []).map((k) => k.key));
      const confirmed = new Set<string>();
      for (const c of def.confirm ?? []) {
        if (!PRINTABLE.test(c.key)) {
          problems.push(`${key} confirms '${c.key}', which is not one printable character`);
        } else if (bound.has(c.key)) {
          problems.push(`${key} binds '${c.key}' in both its keymap and confirm`);
        } else if (confirmed.has(c.key)) {
          problems.push(`${key} confirms '${c.key}' twice`);
        }
        confirmed.add(c.key);
        if (def.on?.[c.act] === undefined) {
          problems.push(
            `${key} confirms '${c.key}' with act '${c.act}', which it has no handler for`
          );
        }
      }
      if (def.escape !== undefined && def.submit === undefined) {
        problems.push(`${key} handles escape without submit, which only an input panel may`);
      }
      if (def.mask === true && def.submit === undefined) {
        problems.push(`${key} masks its input without submit, which only an input panel may`);
      }
      if (def.mask === true && (def.confirm?.length ?? 0) > 0) {
        problems.push(
          `${key} masks its input but declares confirm keys, which would arm on a secret's characters`
        );
      }
      if (def.mask === true) {
        for (const k of keymap ?? []) {
          if ([...k.key].length === 1) {
            problems.push(
              `${key} masks its input but binds '${k.key}', which would make that character untypeable in the secret`
            );
          }
        }
      }
      if (panels.has(key)) problems.push(`panel '${key}' is registered twice`);
      else {
        panels.set(key, {
          module: m.id,
          panel,
          def: keymap ? { ...def, keymap } : def
        });
      }
    }
    for (const b of m.keymap ?? []) {
      const key = canon(b.key);
      if (key === undefined) continue;
      if (RESERVED_GLOBAL_KEYS.includes(key)) {
        problems.push(`${m.id} binds '${b.key}', but '${key}' is reserved by the core`);
        continue;
      }
      if ([...key].length === 1) {
        problems.push(
          `${m.id} binds '${b.key}' globally, which would make that character untypeable`
        );
        continue;
      }
      const prior = globals.get(key);
      if (prior) problems.push(`global key '${key}' is bound by ${prior.module} and ${m.id}`);
      else globals.set(key, { module: m.id, binding: { ...b, key } as GlobalBinding<unknown> });
    }
    for (const [kind, render] of Object.entries(m.renderers ?? {})) {
      const prior = renderers.get(kind);
      if (prior) problems.push(`renderer '${kind}' is registered by ${prior.module} and ${m.id}`);
      else renderers.set(kind, { module: m.id, render });
    }
    if (m.presence !== undefined) {
      if (presence) {
        problems.push(`presence is declared by ${presence.module} and ${m.id}; only one may`);
      } else presence = { module: m.id, spec: m.presence };
    }
    for (const c of m.completers ?? []) completers.push({ module: m.id, completer: c });
    for (const h of m.turns ?? []) {
      const prior = turnIds.get(h.id);
      if (prior) problems.push(`turn handler '${h.id}' is registered by ${prior} and ${m.id}`);
      else turnIds.set(h.id, m.id);
      turns.push({ module: m.id, handler: h as TurnHandler<unknown> });
    }
    for (const item of m.rail ?? []) rail.push({ module: m.id, item });
    for (const item of m.status ?? []) status.push({ module: m.id, item });
  }

  if (problems.length > 0) throw new CompositionError(problems);
  return {
    modules,
    commands,
    panels,
    globals,
    completers,
    turns,
    renderers,
    rail,
    status,
    ...(presence ? { presence } : {})
  };
}

/** One line in an app's tests: a composition conflict becomes a CI failure. */
export function assertComposes(modules: readonly AnyModule[]): void {
  composeModules(modules);
}
