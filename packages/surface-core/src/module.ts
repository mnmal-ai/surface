import type { Theme, Tone } from '@mnmal-ai/surface-theme';
import type { ReactNode } from 'react';
import type { Transcript } from './transcript.js';

/** Ink's key flags plus the raw input, as the core routes them. */
export interface Key {
  readonly input: string;
  readonly ctrl?: boolean;
  readonly meta?: boolean;
  readonly shift?: boolean;
  readonly escape?: boolean;
  readonly return?: boolean;
  readonly tab?: boolean;
  readonly upArrow?: boolean;
  readonly downArrow?: boolean;
  readonly leftArrow?: boolean;
  readonly rightArrow?: boolean;
  readonly backspace?: boolean;
  readonly delete?: boolean;
  readonly home?: boolean;
  readonly end?: boolean;
  readonly pageUp?: boolean;
  readonly pageDown?: boolean;
}

/** 'a', 'ctrl+p', 'meta+x', 'escape', 'enter', 'tab', 'up', 'down', 'left', 'right', 'pageup', 'pagedown'. */
export type KeySpec = string;

/** Room on screen, in terminal cells. */
export interface Size {
  readonly rows: number;
  readonly columns: number;
}

export interface Chip {
  readonly label: string;
  readonly tone?: Tone;
}

/** What a turn renders: a renderer is chosen by `kind`. */
export interface Reply {
  readonly kind: string;
  readonly data: unknown;
  readonly chips?: readonly Chip[];
}

export type TurnPhase = 'pending' | 'partial' | 'final' | 'failed';

export interface TurnUpdate {
  readonly phase: TurnPhase;
  readonly reply: Reply;
}

export interface ArgSpec {
  readonly name: string;
  readonly optional?: boolean;
  /** Id of a completer (`<module>:<completer>`) that completes this argument. */
  readonly completer?: string;
}

export interface Suggestion {
  readonly label: string;
  /** Replaces the token under the cursor, or the `replace` span when one is given. */
  readonly insert: string;
  /**
   * The draft span `insert` replaces, as `[start, end)` character offsets, for a completer
   * that knows its span, which may end after the cursor. Absent, the whitespace token ending at
   * the cursor is replaced, as a shell completes. An invalid span is ignored.
   */
  readonly replace?: readonly [start: number, end: number];
  readonly detail?: string;
  /** Higher ranks first; default 0. */
  readonly score?: number;
}

/**
 * Cross-module events: event name to payload type. Apps extend it by declaration merging:
 * `declare module '@mnmal-ai/surface-core' { interface TuiEvents { 'x/changed': { id: string } } }`.
 */
// biome-ignore lint/suspicious/noEmptyInterface: an open interface, extended by declaration merging
export interface TuiEvents {}

/** What a module may say about a line it submits, beyond its text. */
export interface SubmitOptions {
  /** What the transcript prints as the ask, when it is not the text sent. */
  readonly shown?: string;
  /** A part of the printed ask to set apart; the app's ask view decides how. */
  readonly emphasis?: string;
  /** Whatever the app's turn handler needs; the core never reads it. */
  readonly context?: unknown;
}

/** A turn as its handler receives it. */
export interface TurnContext {
  /** The shell's id for this turn: unique for the session, the same from send to land. */
  readonly id: number;
  /** What the transcript prints as the ask: the text, unless the submitter said otherwise. */
  readonly shown: string;
  readonly emphasis?: string;
  readonly context?: unknown;
}

export interface ModuleCtx<P> {
  readonly theme: Theme;
  /** Aborted when the app exits. */
  readonly signal: AbortSignal;
  /** Opens one of this module's panels, replacing whatever is open. With `ifNoneOpen`, only when no
   *  panel is open: one a module opens on its own, never over one the operator has open. */
  open<K extends keyof P & string>(
    panel: K,
    state: P[K],
    opts?: { readonly ifNoneOpen?: boolean }
  ): void;
  update<K extends keyof P & string>(panel: K, fn: (state: P[K]) => P[K]): void;
  close(): void;
  print(text: string, tone?: Tone): void;
  /**
   * A line the far side started — a greeting, an offer: an answer entry marked
   * `unprompted` and stamped `at`, drawn by its reply's renderer. It answers no question and
   * takes no mark.
   */
  say(reply: Reply): void;
  /**
   * The conversation so far, read-only: committed entries, the turns in flight in send
   * order, and the next mark. Current as of the last commit, not the last render, so a command
   * that prints and then reads sees its own line. The transcript helpers apply to it:
   * `answerEntry(ctx.transcript(), mark)`.
   */
  transcript(): Transcript<Reply>;
  /**
   * A line sent as if typed, and routed as one: a /command runs, anything else is a turn. It stays
   * out of the history, which holds only what the operator typed. `opts` reach the turn as its
   * `TurnContext`.
   */
  submit(text: string, opts?: SubmitOptions): void;
  /** The panel budget now, as a panel's view is given it: for acts that page, and for commands
   *  that open a panel at a page boundary. */
  size(): Size;
  /** Replace the input line, cursor at its end ('' clears it): a rename's prefill. */
  setDraft(text: string): void;
  status(id: string, text: string | null, tone?: Tone): void;
  toast(text: string, tone?: Tone): void;
  emit<K extends keyof TuiEvents>(event: K, payload: TuiEvents[K]): void;
  on<K extends keyof TuiEvents>(event: K, fn: (payload: TuiEvents[K]) => void): () => void;
}

export interface CommandSpec<P = unknown> {
  readonly name: string;
  readonly summary: string;
  readonly args: readonly ArgSpec[];
  /**
   * Why the command cannot run now, or null when it can. Read each time the palette draws and
   * when the command is typed: an unavailable command is left out of the palette, and typed in
   * full it prints `/<name>: <reason>` instead of running. A thunk that throws, or returns an
   * empty reason, counts as unavailable, with the reason `unavailable`.
   */
  readonly unavailable?: () => string | null;
  run(args: readonly string[], ctx: ModuleCtx<P>): void | Promise<void>;
}

/**
 * Letter, then Enter: a verdict that must not ride on a keystroke meant as text. On an
 * empty draft the key is typed as usual and arms the act; Enter runs it only while the draft is
 * still exactly that key, and any other edit disarms it.
 */
export interface ConfirmBinding {
  /** One printable character. */
  readonly key: string;
  readonly act: string;
  /** What Enter will do, for the view to say: 'approves this proposal'. */
  readonly label: string;
}

/** The confirm binding Enter would run now, as a panel's view is told it. */
export interface Armed {
  readonly key: string;
  readonly label: string;
}

export interface PanelDef<S, P = unknown> {
  readonly view: (props: {
    readonly state: S;
    readonly theme: Theme;
    /** Present while a confirm key is armed on this panel. */
    readonly armed?: Armed;
    /** The room the panel has: the columns left beside the rail, and `AppOptions.panelRows`. */
    readonly size: Size;
  }) => ReactNode;
  readonly keymap?: readonly { readonly key: KeySpec; readonly act: string }[];
  /**
   * Letter, then Enter (`ConfirmBinding`). A panel that declares any keeps the draft live under
   * it: a key its keymap does not bind edits the line, and Enter runs the armed act or sends
   * the line as typed. A panel without `confirm` takes every key, as before.
   */
  readonly confirm?: readonly ConfirmBinding[];
  /**
   * The panel owns the input line. While it is focused, a submitted line that is not a
   * `/command` (or every typed line, `/command` included, when `mask` is set) comes here, the
   * empty line included, instead of going to the turn handlers. It is
   * an entry in the panel, not a turn, so it stays out of the history. The draft stays live
   * under the panel, as for `confirm`. Return the next state, or undefined to keep it.
   */
  readonly submit?: (state: S, line: string, ctx: ModuleCtx<P>) => S | undefined;
  /**
   * Escape on a panel with `submit`: return a state to stay open with it (abandoning an edit in
   * progress), or undefined to close as usual. A different panel opened here with `ctx.open`
   * replaces this one rather than being closed with it. Only for a panel with `submit`.
   */
  readonly escape?: (state: S, ctx: ModuleCtx<P>) => S | undefined;
  /**
   * The input line is a secret while this panel is focused, e.g. a passphrase. The draft draws
   * as `•`, every typed line goes to `submit` (a `/command` too; a module's `ctx.submit` still
   * routes as usual), and nothing typed reaches the history, the palette, the completers or the
   * transcript. The draft is cleared when the panel gains or loses focus, however that happens.
   * `submit` must never echo the line in a thrown error or a print: a throw's message is printed
   * to the transcript. Only for a panel with `submit`, and refused with `confirm` or with a
   * printable single-character key in `keymap`.
   */
  readonly mask?: boolean;
  /** act -> handler. Returning a state replaces the panel's state. */
  readonly on?: Readonly<Record<string, (state: S, ctx: ModuleCtx<P>) => S | undefined>>;
}

export interface GlobalBinding<P = unknown> {
  readonly key: KeySpec;
  run(ctx: ModuleCtx<P>): void;
}

export interface Completer {
  readonly id: string;
  complete(draft: string, cursor: number): readonly Suggestion[] | Promise<readonly Suggestion[]>;
}

export interface TurnHandler<P = unknown> {
  readonly id: string;
  /** A priority if this handler wants the text, else false. */
  claims(text: string): number | false;
  answer(
    text: string,
    ctx: ModuleCtx<P>,
    signal: AbortSignal,
    turn: TurnContext
  ): AsyncIterable<TurnUpdate>;
}

/** A reply's view. `size.columns` is the width it prints at; a final reply goes to `<Static>`,
 *  where height means nothing, so it gets no rows. */
export type Renderer = (props: {
  readonly data: unknown;
  readonly theme: Theme;
  readonly size: { readonly columns: number };
}) => ReactNode;

export interface RailItem {
  readonly id: string;
  readonly view: (props: { readonly theme: Theme }) => ReactNode;
}

/**
 * A module's identity in the input band's presence row: its name, then a dim, truncating view.
 * Only drawn when the app sets `band`; otherwise ignored. At most one module may declare it.
 */
export interface PresenceSpec {
  /** Rendered by the core, in bold, after sanitising. */
  readonly name: string;
  /** Rendered inside a truncating `<Text>`: return inline text, never a Box. */
  readonly view?: (props: { readonly theme: Theme }) => ReactNode;
}

export interface ModuleSpec<P> {
  readonly presence?: PresenceSpec;
  readonly commands?: readonly CommandSpec<P>[];
  readonly panels?: { readonly [K in keyof P]: PanelDef<P[K], P> };
  readonly keymap?: readonly GlobalBinding<P>[];
  readonly completers?: readonly Completer[];
  readonly turns?: readonly TurnHandler<P>[];
  readonly renderers?: Readonly<Record<string, Renderer>>;
  readonly rail?: readonly RailItem[];
  readonly status?: readonly RailItem[];
  init?(ctx: ModuleCtx<P>): undefined | (() => void);
}

export interface TuiModule<P = Record<string, never>> extends ModuleSpec<P> {
  readonly id: string;
}

const MODULE_ID = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)*$/;

export function defineModule<P extends Record<string, unknown> = Record<string, never>>(
  id: string,
  spec: ModuleSpec<P>
): TuiModule<P> {
  if (!MODULE_ID.test(id)) {
    throw new Error(`module id '${id}' must be lower-case dotted, e.g. 'app.ask'`);
  }
  return { id, ...spec };
}
