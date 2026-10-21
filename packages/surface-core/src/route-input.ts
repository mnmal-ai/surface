import type { Registry } from './compose.js';
import type { CommandSpec, TurnHandler } from './module.js';
import { parseCommandLine } from './palette.js';

export type InputRoute =
  | {
      readonly kind: 'command';
      readonly module: string;
      readonly spec: CommandSpec<unknown>;
      readonly args: string[];
    }
  | { readonly kind: 'unknown-command'; readonly name: string }
  | { readonly kind: 'unavailable-command'; readonly name: string; readonly reason: string }
  | { readonly kind: 'turn'; readonly module: string; readonly handler: TurnHandler<unknown> }
  | { readonly kind: 'no-handler' };

/** A handler whose `claims` throws is treated as not claiming, so one bad module cannot block input. */
function claimOf(handler: TurnHandler<unknown>, line: string): number | false {
  try {
    return handler.claims(line);
  } catch {
    return false;
  }
}

/**
 * A command's `unavailable` reason, or null. A throwing thunk, or an empty reason, is unavailable
 * with the reason `unavailable`; an undefined one (a loose JS consumer) is available.
 */
export function unavailableReason(spec: CommandSpec<unknown>): string | null {
  if (spec.unavailable === undefined) return null;
  let reason: string | null;
  try {
    reason = spec.unavailable() ?? null;
  } catch {
    return 'unavailable';
  }
  return reason === '' ? 'unavailable' : reason;
}

export function routeInput(line: string, registry: Registry, defaultTurn?: string): InputRoute {
  const cmd = parseCommandLine(line);
  if (cmd !== null) {
    const hit = registry.commands.get(cmd.name);
    if (!hit) return { kind: 'unknown-command', name: cmd.name };
    const reason = unavailableReason(hit.spec);
    if (reason !== null) return { kind: 'unavailable-command', name: cmd.name, reason };
    return { kind: 'command', module: hit.module, spec: hit.spec, args: cmd.args };
  }
  let best: { module: string; handler: TurnHandler<unknown>; score: number } | null = null;
  for (const t of registry.turns) {
    const score = claimOf(t.handler, line);
    if (score === false) continue;
    if (best === null || score > best.score) best = { ...t, score };
  }
  if (best !== null) return { kind: 'turn', module: best.module, handler: best.handler };
  if (defaultTurn !== undefined) {
    const d = registry.turns.find((t) => `${t.module}:${t.handler.id}` === defaultTurn);
    if (d) return { kind: 'turn', module: d.module, handler: d.handler };
  }
  return { kind: 'no-handler' };
}
