import { spinnerFrame } from '@mnmal-ai/surface-kit';
import type { Theme, Tone } from '@mnmal-ai/surface-theme';
import {
  Box,
  type DOMElement,
  measureElement,
  render,
  Static,
  Text,
  useApp,
  useInput,
  usePaste,
  useStdout
} from 'ink';
import {
  Component,
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { applySuggestion, mergeCompletions } from './complete.js';
import { composeModules, type Registry } from './compose.js';
import {
  atEnd,
  type Draft,
  EMPTY_DRAFT,
  editKey,
  graphemeAt,
  insertChunk,
  maskDraft,
  pasteToLine
} from './editor.js';
import { CTRL_C_WINDOW_MS, ctrlC } from './exit-chord.js';
import { EMPTY_HISTORY, type HistoryState, remember, settle, walk } from './history.js';
import { type KeyState, resolveKey } from './keys.js';
import type {
  Key,
  ModuleCtx,
  Reply,
  Size,
  SubmitOptions,
  Suggestion,
  TuiModule,
  TurnContext,
  TurnHandler
} from './module.js';
import {
  clampSelection,
  commandUsage,
  completeDraft,
  enterRuns,
  MENU_NAME_WIDTH,
  menuWindow,
  moveSelection,
  paletteQuery,
  paletteRows,
  parseCommandLine
} from './palette.js';
import { routeInput, unavailableReason } from './route-input.js';
import { sanitise } from './sanitise.js';
import {
  type LiveMeasure,
  liveShrink,
  type PrepareTerminalOptions,
  prepareTerminal,
  REPRINT_LINES,
  reflowSequence,
  reprintStart
} from './terminal.js';
import {
  type AnswerEntry,
  type AskEntry,
  addGap,
  arriveTurn,
  commitEntry,
  dropGaps,
  type Entry,
  emptyTranscript,
  type Flight as HeldAsk,
  heldAsks,
  markedFlights,
  type NoteEntry,
  sendTurn,
  type Transcript
} from './transcript.js';

// biome-ignore lint/suspicious/noExplicitAny: erased per-module panel maps
type AnyModule = TuiModule<any>;

/**
 * An app's view of an ask: a committed one, or one still waiting for its answer (`held`).
 * `entry.question` and `entry.emphasis` arrive as typed or submitted, unsanitised, where the
 * core's own echo sanitises them: pass them through `sanitise` before drawing.
 */
export interface AskViewProps {
  readonly entry: AskEntry | HeldAsk;
  readonly held: boolean;
  readonly theme: Theme;
  readonly size: { readonly columns: number };
}

/** An app's frame around an answer: `body` is the reply as its renderer drew it, with its
 *  chips. The entry's own text fields (`question`) arrive unsanitised, as in `AskViewProps`. */
export interface AnswerViewProps {
  readonly entry: AnswerEntry<Reply>;
  readonly body: ReactNode;
  readonly theme: Theme;
  readonly size: { readonly columns: number };
}

/**
 * An app's line for a turn still waiting for its answer: under its ask while the ask is
 * held (`held`), or on its own once its ask was printed with a mark because a later answer
 * overtook it. `reply` is its latest pending update, if one came; `body` is what the core draws
 * for the turn — that update through its renderer, else a spinner.
 */
export interface WaitingViewProps {
  readonly flight: HeldAsk;
  readonly held: boolean;
  readonly reply?: Reply;
  readonly body: ReactNode;
  readonly theme: Theme;
  readonly size: { readonly columns: number };
}

/** An app's view of a note, the surface's own line. `entry.text` arrives unsanitised. */
export interface NoteViewProps {
  readonly entry: NoteEntry;
  readonly theme: Theme;
  readonly size: { readonly columns: number };
}

export interface AppOptions {
  readonly theme: Theme;
  readonly modules: readonly AnyModule[];
  /** `<module>:<handlerId>` used when no turn handler claims the text. */
  readonly defaultTurn?: string;
  /** Below this terminal width the right rail is hidden. Default 80. */
  readonly railMinColumns?: number;
  /**
   * Columns of inset on each side of everything the shell draws: transcript, live region, band and
   * status row (a pane gutter). Whole numbers 0 to 8; default 0. Panels and renderers are
   * sized to the width left inside it.
   */
  readonly gutter?: number;
  /**
   * Draws the input line and a presence row inside a bold left-edged band, with a block cursor and
   * no prompt glyph.
   * The exit-chord hint moves from the toast row into the presence row's notice. When false (the
   * default) the frame is unchanged and a module's `presence` is ignored.
   */
  readonly band?: boolean;
  /**
   * A bottom-anchored pane: the input stays on the terminal's last row. When
   * the live region shrinks with nothing printed above it, blank rows are printed so the pane
   * scrolls back; a resize (wider, narrower or taller) and a panel or menu closing re-lay the
   * pane — wipe it and print the transcript again at the current width — and a line sent by the
   * act that closes the menu runs one render later, so its close is reclaimed first. The cost of
   * a re-lay is the terminal's scrollback from before the session. Default false: the frame is
   * unchanged.
   */
  readonly anchored?: boolean;
  /**
   * How `run()` prepares the terminal before the first frame (ground, pane wipe, bottom anchor).
   * Options here pass through to `prepareTerminal`, over an `anchor` that follows `anchored`.
   * `false`: the host prepared the terminal itself and owns restoring it, so `run()` touches
   * nothing. Default: prepared with the defaults.
   */
  readonly terminal?: PrepareTerminalOptions | false;
  /**
   * The app's own frames for the conversation. `ask` draws an ask, committed or held;
   * `answer` draws the frame around an answer's body. Either one left out keeps the core's:
   * `⟨n⟩ › question` for an ask, and a `↩ ⟨n⟩` line above the body for a marked answer. A view
   * that throws is reported as `app view failed`, as a renderer's failure is.
   */
  readonly entries?: {
    readonly ask?: (props: AskViewProps) => ReactNode;
    readonly answer?: (props: AnswerViewProps) => ReactNode;
    /** A turn still waiting. Left out: the body under a held ask, and `⟨n⟩` then the
     *  body for a marked one. */
    readonly waiting?: (props: WaitingViewProps) => ReactNode;
    /** A note, the surface's own line. Left out: the text in its tone. */
    readonly note?: (props: NoteViewProps) => ReactNode;
  };
  /** What the first ctrl+c says, in the toast row or the band's notice. Default
   *  'press ctrl+c again to exit'. */
  readonly exitHint?: string;
  /**
   * Rows the panel overlay takes, from the terminal's rows. Default `defaultPanelRows`,
   * which subtracts the band's rows when `band` is set. An explicit function is taken as-is and is
   * NOT band-adjusted: it must already count the band. A view gets these rows, and the
   * columns less the overlay's side inset (4).
   */
  readonly panelRows?: (terminalRows: number) => number;
}

type Menu =
  | { readonly kind: 'palette'; readonly selected: number; readonly moved: boolean }
  | {
      readonly kind: 'completion';
      readonly items: readonly Suggestion[];
      readonly selected: number;
    };

interface Overlay {
  readonly module: string;
  readonly panel: string;
  readonly state: unknown;
}

/** A confirm key armed on one panel. */
interface ArmedOn {
  readonly module: string;
  readonly panel: string;
  readonly key: string;
  readonly act: string;
  readonly label: string;
  /** The panel's state when it was armed: Enter acts on that, or not at all. */
  readonly state: unknown;
}

/** Calls a module's view as a component, so a throw lands in the boundary and not in the shell. */
function Run({ render }: { render: () => ReactNode }): ReactNode {
  const out = render();
  return typeof out === 'string' || typeof out === 'number' ? (
    <Text>{sanitise(String(out))}</Text>
  ) : (
    out
  );
}

class Boundary extends Component<
  { module: string; theme: Theme; children: ReactNode },
  { error: string | null }
> {
  override state = { error: null as string | null };
  static getDerivedStateFromError(err: unknown) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
  override render(): ReactNode {
    if (this.state.error === null) return this.props.children;
    const reason = sanitise(this.state.error).split('\n')[0];
    return (
      <Text color={this.props.theme.color.error}>
        {this.props.theme.glyph.fail} {sanitise(this.props.module)} view failed: {reason}
      </Text>
    );
  }
}

function Safe(props: { module: string; theme: Theme; render: () => ReactNode }): ReactElement {
  return (
    <Boundary module={props.module} theme={props.theme}>
      <Run render={props.render} />
    </Boundary>
  );
}

/** A committed entry as `Static` prints it, recording its height for the next re-lay's budget. */
function Printed(props: {
  id: string;
  heights: Map<string, number>;
  paddingX: number;
  children: ReactNode;
}): ReactElement {
  const ref = useRef<DOMElement>(null);
  useEffect(() => {
    if (ref.current !== null) props.heights.set(props.id, measureElement(ref.current).height);
  });
  return (
    <Box ref={ref} paddingX={props.paddingX} flexDirection="column">
      {props.children}
    </Box>
  );
}

const ERROR_KIND = 'core.error';
const CANCELLED_KIND = 'core.cancelled';
const TOAST_MS = 3000;
/** A window drag resizes per step; the pane is re-laid once, when it settles. */
const REFLOW_SETTLE_MS = 150;

interface Flight {
  readonly ac: AbortController;
  /** Lands a reply once; later calls are no-ops, so a cancelled turn ignores its handler. */
  readonly land: (reply: Reply) => boolean;
}

/** Columns the rail takes when it shows: its width and the margin before it. */
const RAIL_COLUMNS = 33;
/** Rows the shell keeps for itself: the input, the toast and the status row, and a little
 *  conversation above the panel. */
const SHELL_ROWS = 6;
/** What the band adds: its top and bottom padding, the presence row with a blank row above it,
 *  and the blank row between the band and the status row. */
const BAND_ROWS = 5;
/** Insets on raised menus (the / palette, completions): two columns each side and a row top and
 *  bottom (operator, 2026-10-09). The rows come out of the menu's row budget, so it never grows. */
const OVERLAY_PAD_X = 2;
const OVERLAY_PAD_Y = 1;
/** A panel's insets. Wider than a menu's and with a row top and bottom, because a panel is read,
 *  not scanned; both come out of the size the panel view is handed (operator, 2026-10-09). */
const PANEL_PAD_X = 4;
const PANEL_PAD_Y = 1;

interface MenuRow {
  readonly key: string;
  readonly name: string;
  readonly detail: string;
}

/**
 * The `/` palette and the completion menu, directly above the input on the band's ground: a fixed name column, the detail dimmed, the selection on the `selection` tone, a window
 * that follows the selection, and a hint line.
 */
function MenuList({
  theme,
  rows,
  selected,
  height,
  empty,
  hint
}: {
  theme: Theme;
  rows: readonly MenuRow[];
  selected: number;
  height: number;
  empty: string;
  hint: string;
}): ReactElement {
  const { start, end, position } = menuWindow(rows.length, selected, height);
  return (
    <Box
      flexDirection="column"
      paddingX={OVERLAY_PAD_X}
      paddingY={OVERLAY_PAD_Y}
      backgroundColor={theme.color.raised}
    >
      {rows.length === 0 ? (
        <Text color={theme.color.dim} wrap="truncate">
          {sanitise(empty)}
        </Text>
      ) : (
        rows.slice(start, end).map((r, i) => {
          const on = start + i === selected;
          return (
            <Box key={r.key} {...(on ? { backgroundColor: theme.color.selection } : {})}>
              <Box width={MENU_NAME_WIDTH} flexShrink={0}>
                <Text bold={on} wrap="truncate" {...(on ? { color: theme.color.surface } : {})}>
                  {sanitise(r.name)}
                </Text>
              </Box>
              <Text color={on ? theme.color.surface : theme.color.dim} wrap="truncate">
                {sanitise(r.detail)}
              </Text>
            </Box>
          );
        })
      )}
      <Text color={theme.color.dim} wrap="truncate">
        {`↑↓ select${position} · ${hint}`}
      </Text>
    </Box>
  );
}

/** A panel's rows by default: the terminal less the shell's own, and never under three. */
export function defaultPanelRows(terminalRows: number, opts?: { readonly band?: boolean }): number {
  return Math.max(3, terminalRows - SHELL_ROWS - (opts?.band === true ? BAND_ROWS : 0));
}

/** Fixed dimensions for tests and embedding; absent, the shell reads the terminal and follows it. */
interface AppProps {
  readonly columns?: number;
  readonly rows?: number;
}

/** What `run()` prepares the terminal with, or `null` when the host has prepared it already. */
export function runTerminalOptions(
  opts: Pick<AppOptions, 'anchored' | 'terminal'>
): PrepareTerminalOptions | null {
  if (opts.terminal === false) return null;
  return { anchor: opts.anchored === true, ...opts.terminal };
}

export function createApp(opts: AppOptions): {
  registry: Registry;
  App: (props: AppProps) => ReactElement;
  run(): Promise<void>;
} {
  const registry = composeModules(opts.modules);
  const theme = opts.theme;
  const railMin = opts.railMinColumns ?? 80;
  const askView = opts.entries?.ask;
  const answerView = opts.entries?.answer;
  const waitingView = opts.entries?.waiting;
  const noteView = opts.entries?.note;
  const exitHint = sanitise(opts.exitHint ?? 'press ctrl+c again to exit');
  const g = opts.gutter ?? 0;
  const gutter = Number.isInteger(g) && g >= 0 && g <= 8 ? g : 0;
  const band = opts.band === true;
  const presence = registry.presence?.spec;
  const presenceModule = registry.presence?.module ?? '';
  const panelRows = opts.panelRows ?? ((r: number) => defaultPanelRows(r, { band }));
  const anchored = opts.anchored === true;

  function App({ columns, rows }: AppProps): ReactElement {
    const { exit } = useApp();
    // The terminal as it is now, re-read on resize so views re-render at the new size.
    // Ink types it as any writable; on a terminal it is a tty.WriteStream, and off one these are unset.
    const stdout = useStdout().stdout as NodeJS.WritableStream &
      Partial<Pick<NodeJS.WriteStream, 'columns' | 'rows' | 'isTTY'>>;
    const [term, setTerm] = useState(() => ({
      columns: stdout.columns ?? 120,
      rows: stdout.rows ?? 30
    }));
    const [transcript, setTranscript] = useState<Transcript<Reply>>(() => emptyTranscript<Reply>());
    // ctx.transcript() reads the transcript as committed, not as last rendered: every change goes
    // through putTranscript, which updates the ref before React hears of it.
    const transcriptRef = useRef(transcript);
    const putTranscript = useCallback((fn: (t: Transcript<Reply>) => Transcript<Reply>) => {
      transcriptRef.current = fn(transcriptRef.current);
      setTranscript(transcriptRef.current);
    }, []);
    // A re-lay (`anchored`): the pane wiped, then the committed entries printed again, because
    // `Static` is keyed by the epoch and a new one writes them all at the current width. The gaps
    // go: each scrolled a pane that no longer exists. Only the newest REPRINT_LINES are printed,
    // by the heights each entry measured when it was last printed. All of it lands in one render,
    // so the old `Static` never sees its entries removed.
    const [epoch, setEpoch] = useState(0);
    const heights = useRef(new Map<string, number>());
    const [reprintFrom, setReprintFrom] = useState(0);
    const relayout = useCallback(() => {
      if (stdout.isTTY) stdout.write(reflowSequence(stdout.rows));
      putTranscript(dropGaps);
      const kept = transcriptRef.current.committed;
      setReprintFrom(
        reprintStart(
          kept.map((e) => heights.current.get(e.key) ?? 1),
          REPRINT_LINES
        )
      );
      setEpoch((e) => e + 1);
    }, [stdout, putTranscript]);
    useEffect(() => {
      const laidOut = { columns: stdout.columns ?? 120, rows: stdout.rows ?? 30 };
      let timer: ReturnType<typeof setTimeout> | undefined;
      const onResize = () => {
        setTerm({ columns: stdout.columns ?? 120, rows: stdout.rows ?? 30 });
        if (!anchored) return;
        clearTimeout(timer);
        timer = setTimeout(() => {
          const now = { columns: stdout.columns ?? 120, rows: stdout.rows ?? 30 };
          // Shorter only wraps nothing and leaves the input on the last row; wider, narrower or
          // taller (which opens rows below the input that nothing fills) re-lays.
          const grew = now.rows > laidOut.rows;
          laidOut.rows = now.rows;
          if (now.columns === laidOut.columns && !grew) return;
          laidOut.columns = now.columns;
          relayout();
        }, REFLOW_SETTLE_MS);
      };
      stdout.on('resize', onResize);
      return () => {
        clearTimeout(timer);
        stdout.off('resize', onResize);
      };
    }, [stdout, relayout]);
    const width = Math.max(1, (columns ?? term.columns) - 2 * gutter);
    const height = rows ?? term.rows;
    const showRail = registry.rail.length > 0 && width >= railMin;
    const panelOuter: Size = {
      columns: Math.max(1, width - (showRail ? RAIL_COLUMNS : 0)),
      rows: Math.max(1, panelRows(height))
    };
    // What a panel view may draw in: the panel's insets come out of its columns and rows.
    const panelSize: Size = {
      columns: Math.max(1, panelOuter.columns - 2 * PANEL_PAD_X),
      rows: Math.max(1, panelOuter.rows - 2 * PANEL_PAD_Y)
    };
    // ctx.size() reads the size the last render laid out.
    const sizeRef = useRef(panelSize);
    sizeRef.current = panelSize;
    const [live, setLive] = useState<ReadonlyMap<number, Reply>>(new Map());
    const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
    const [, setHistory] = useState<HistoryState>(EMPTY_HISTORY);
    const [overlay, setOverlay] = useState<Overlay | null>(null);
    const [menu, setMenu] = useState<Menu | null>(null);
    const [status, setStatus] = useState<ReadonlyMap<string, { text: string; tone: Tone }>>(
      new Map()
    );
    const [toast, setToast] = useState<{ text: string; tone: Tone } | null>(null);
    // Ink delivers several chunks before React re-renders, so the draft is mirrored synchronously.
    const draftRef = useRef<Draft>(EMPTY_DRAFT);
    // Bumped on every draft change and every completion request; a stale completion is discarded.
    const requests = useRef(0);
    const nextId = useRef(1);
    const notes = useRef(0);
    const armedAt = useRef<number | null>(null);
    const flights = useRef(new Map<number, Flight>());
    const disposed = useRef(false);
    const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Like the draft, these are read inside useInput, which can run several times per render.
    const menuRef = useRef<Menu | null>(null);
    const overlayRef = useRef<Overlay | null>(null);
    const historyRef = useRef<HistoryState>(EMPTY_HISTORY);
    const putMenu = useCallback((m: Menu | null) => {
      menuRef.current = m;
      setMenu(m);
    }, []);
    // The armed confirm key: which panel, and what Enter will run. Held only while the
    // draft is exactly that key; every other edit, a paste, history and a closed panel clear it.
    const [armed, setArmed] = useState<ArmedOn | null>(null);
    const armedRef = useRef<ArmedOn | null>(null);
    const putArmed = useCallback((a: ArmedOn | null) => {
      if (armedRef.current === a) return;
      armedRef.current = a;
      setArmed(a);
    }, []);
    const defOf = useCallback(
      (o: Overlay | null) => (o ? registry.panels.get(`${o.module}/${o.panel}`)?.def : undefined),
      []
    );
    const putHistory = useCallback((h: HistoryState) => {
      historyRef.current = h;
      setHistory(h);
    }, []);
    const putOverlay = useCallback(
      (o: Overlay | null) => {
        const was = overlayRef.current;
        const moved =
          o === null || was === null || o.module !== was.module || o.panel !== was.panel;
        // A secret never outlives its panel: leaving a masked panel, by any route, clears the line.
        // Nor does it inherit one: entering a masked panel starts on an empty line, with no menu,
        // history walk or armed key carried in from before.
        if (moved && (defOf(was)?.mask === true || defOf(o)?.mask === true)) {
          draftRef.current = EMPTY_DRAFT;
          requests.current += 1;
          setDraft(EMPTY_DRAFT);
          if (defOf(o)?.mask === true) {
            if (menuRef.current !== null) putMenu(null);
            putHistory(settle(historyRef.current));
            putArmed(null);
          }
        }
        overlayRef.current = o;
        setOverlay(o);
        // An armed key acts on the panel as it was armed. A move, a reload or any other change of
        // state disarms it, so Enter can never act on a row the user did not arm on.
        const a = armedRef.current;
        if (
          a !== null &&
          (o === null || o.module !== a.module || o.panel !== a.panel || o.state !== a.state)
        ) {
          putArmed(null);
        }
      },
      [putArmed, defOf, putMenu, putHistory]
    );
    const showToast = useCallback((text: string, tone: Tone, ms: number) => {
      if (disposed.current) return;
      if (toastTimer.current !== null) clearTimeout(toastTimer.current);
      setToast({ text: sanitise(text), tone });
      toastTimer.current = setTimeout(() => {
        toastTimer.current = null;
        setToast(null);
      }, ms);
    }, []);
    const showNotice = useCallback((text: string, ms: number) => {
      if (disposed.current) return;
      if (noticeTimer.current !== null) clearTimeout(noticeTimer.current);
      setNotice(sanitise(text));
      noticeTimer.current = setTimeout(() => {
        noticeTimer.current = null;
        setNotice(null);
      }, ms);
    }, []);
    const bus = useRef(new Map<string, Set<(p: unknown) => void>>());
    const appAbort = useRef(new AbortController());
    // ctx.submit needs handleLine, which needs ctxFor: break the cycle through a ref.
    const handleLineRef = useRef<(line: string, sent?: SubmitOptions) => void>(() => {});
    // ctx.setDraft, likewise: the draft's setter is declared after ctxFor.
    const setDraftRef = useRef<(text: string) => void>(() => {});

    const print = useCallback(
      (text: string, tone?: Tone) => {
        if (disposed.current) return;
        notes.current += 1;
        const entry: Entry<Reply> = {
          key: `note:${notes.current}`,
          kind: 'note',
          text: sanitise(text),
          ...(tone ? { tone } : {})
        };
        putTranscript((t) => commitEntry(t, entry));
      },
      [putTranscript]
    );

    const say = useCallback(
      (reply: Reply) => {
        if (disposed.current) return;
        notes.current += 1;
        const entry: Entry<Reply> = {
          key: `said:${notes.current}`,
          kind: 'answer',
          question: '',
          reply,
          mark: null,
          unprompted: true,
          at: Date.now()
        };
        putTranscript((t) => commitEntry(t, entry));
      },
      [putTranscript]
    );

    // A module's failure is its own: report it by name and keep the app running.
    const guard = useCallback(
      (moduleId: string, fn: () => unknown) => {
        const fail = (err: unknown) =>
          print(`${moduleId}: ${err instanceof Error ? err.message : String(err)}`, 'error');
        try {
          const r = fn();
          if (r instanceof Promise) r.catch(fail);
        } catch (err) {
          fail(err);
        }
      },
      [print]
    );

    const ctxFor = useCallback(
      (moduleId: string): ModuleCtx<Record<string, unknown>> => ({
        theme,
        signal: appAbort.current.signal,
        size: () => sizeRef.current,
        open: (panel, state, opts) => {
          if (disposed.current) return;
          if (!registry.panels.has(`${moduleId}/${panel}`)) {
            throw new Error(`module '${moduleId}' has no panel '${panel}'`);
          }
          if (opts?.ifNoneOpen === true && overlayRef.current !== null) return;
          putOverlay({ module: moduleId, panel, state });
        },
        update: (panel, fn) => {
          if (disposed.current) return;
          const o = overlayRef.current;
          if (o && o.module === moduleId && o.panel === panel) {
            putOverlay({ ...o, state: fn(o.state) });
          }
        },
        close: () => {
          if (!disposed.current && overlayRef.current?.module === moduleId) putOverlay(null);
        },
        print,
        say,
        transcript: () => transcriptRef.current,
        submit: (text, opts) => {
          if (!disposed.current) handleLineRef.current(text, opts ?? {});
        },
        setDraft: (text) => {
          if (!disposed.current) setDraftRef.current(text);
        },
        status: (id, text, tone) => {
          if (disposed.current) return;
          setStatus((s) => {
            const next = new Map(s);
            if (text === null) next.delete(`${moduleId}:${id}`);
            else next.set(`${moduleId}:${id}`, { text: sanitise(text), tone: tone ?? 'dim' });
            return next;
          });
        },
        toast: (text, tone) => showToast(text, tone ?? 'info', TOAST_MS),
        emit: (event, payload) => {
          for (const fn of [...(bus.current.get(event) ?? [])]) fn(payload);
        },
        on: (event, fn) => {
          const set = bus.current.get(event) ?? new Set();
          const safe = (p: unknown) => guard(moduleId, () => fn(p as never));
          set.add(safe);
          bus.current.set(event, set);
          return () => set.delete(safe);
        }
      }),
      [print, say, guard, putOverlay, showToast]
    );

    const runTurn = useCallback(
      async (line: string, module: string, handler: TurnHandler<unknown>, sent?: SubmitOptions) => {
        const id = nextId.current++;
        const turn: TurnContext = {
          id,
          shown: sent?.shown ?? line,
          ...(sent?.emphasis === undefined ? {} : { emphasis: sent.emphasis }),
          ...(sent?.context === undefined ? {} : { context: sent.context })
        };
        const ac = new AbortController();
        let landed = false;
        const land = (reply: Reply): boolean => {
          if (landed) return false;
          landed = true;
          flights.current.delete(id);
          if (disposed.current) return true;
          setLive((m) => {
            const next = new Map(m);
            next.delete(id);
            return next;
          });
          putTranscript((t) => arriveTurn(t, id, reply));
          return true;
        };
        flights.current.set(id, { ac, land });
        putTranscript((t) => sendTurn(t, id, turn.shown, turn.emphasis));
        try {
          for await (const u of handler.answer(
            line,
            ctxFor(module) as ModuleCtx<unknown>,
            ac.signal,
            turn
          )) {
            if (landed) return;
            if (u.phase === 'final' || u.phase === 'failed') {
              land(u.reply);
              return;
            }
            if (disposed.current) return;
            setLive((m) => new Map(m).set(id, u.reply));
          }
          land({ kind: ERROR_KIND, data: 'no answer' });
        } catch (err) {
          land({ kind: ERROR_KIND, data: err instanceof Error ? err.message : String(err) });
        }
      },
      [ctxFor, putTranscript]
    );

    // `sent` is present for a line a module submitted (ctx.submit), absent for one the operator
    // typed: only a typed line joins the history, or one its module says was typed.
    const handleLine = useCallback(
      (line: string, sent?: SubmitOptions) => {
        const text = line.trim();
        // A focused panel that owns the input line takes every line but a /command, and a
        // masked one every typed line. The line is an entry in the panel, not a turn, so it stays
        // out of the history.
        const open = overlayRef.current;
        const owner = open ? registry.panels.get(`${open.module}/${open.panel}`)?.def : undefined;
        if (
          open &&
          owner?.submit &&
          ((owner.mask === true && sent === undefined) || parseCommandLine(text) === null)
        ) {
          let next: unknown;
          try {
            next = owner.submit(open.state, line, ctxFor(open.module) as ModuleCtx<unknown>);
          } catch (err) {
            guard(open.module, () => {
              throw err;
            });
            return;
          }
          const cur = overlayRef.current;
          if (next !== undefined && cur?.module === open.module && cur.panel === open.panel) {
            putOverlay({ ...cur, state: next });
          }
          return;
        }
        if (text === '') return;
        if (sent === undefined || sent.remember === true) {
          putHistory(remember(historyRef.current, text));
        }
        const route = routeInput(text, registry, opts.defaultTurn);
        if (route.kind === 'command') {
          Promise.resolve()
            .then(() => route.spec.run(route.args, ctxFor(route.module) as ModuleCtx<unknown>))
            .catch((err: unknown) =>
              print(
                `/${route.spec.name} failed: ${err instanceof Error ? err.message : String(err)}`,
                'error'
              )
            );
        } else if (route.kind === 'unknown-command') {
          print(`unknown command /${route.name}`, 'warn');
        } else if (route.kind === 'unavailable-command') {
          print(`/${route.name}: ${route.reason}`, 'warn');
        } else if (route.kind === 'turn') {
          void runTurn(text, route.module, route.handler, sent);
        } else {
          print('nothing here answers that', 'warn');
        }
      },
      [ctxFor, print, putHistory, runTurn, guard, putOverlay]
    );
    handleLineRef.current = handleLine;

    // The live region, measured after every render (`anchored`): when it gives up rows with
    // nothing printed above it, a gap of that many blank rows scrolls the pane back down, so the
    // input stays on the last row. Gaps are not counted as printed: a gap scrolls the pane by
    // exactly its own rows, so a shrink spread over two renders is still owed its second half.
    const liveRef = useRef<DOMElement>(null);
    const lastLive = useRef<LiveMeasure | null>(null);
    useEffect(() => {
      if (!anchored || liveRef.current === null) return;
      const now: LiveMeasure = {
        height: measureElement(liveRef.current).height,
        committed: transcript.committed.filter((e) => e.kind !== 'gap').length,
        epoch
      };
      const shrink = liveShrink(lastLive.current, now);
      lastLive.current = now;
      if (shrink > 0) putTranscript((t) => addGap(t, shrink, epoch));
    });
    // A panel or a menu closing re-lays the pane (`anchored`): opening one scrolled the
    // conversation up, and a terminal cannot scroll it back down. Keyed on the transition, so
    // every way one closes is covered.
    const panelOpen = overlay !== null || menu !== null;
    const wasPanelOpen = useRef(panelOpen);
    useEffect(() => {
      if (anchored && wasPanelOpen.current && !panelOpen) relayout();
      wasPanelOpen.current = panelOpen;
    }, [panelOpen, relayout]);
    // A line sent by the act that closed the menu runs one render later (`anchored`). The close is
    // measured above, and reclaimed only when nothing was printed in the same render, so the line
    // waits for it. Declared after the measuring effect: effects run in declaration order.
    const [pendingLine, setPendingLine] = useState<string | null>(null);
    useEffect(() => {
      if (pendingLine === null) return;
      setPendingLine(null);
      handleLine(pendingLine);
    }, [pendingLine, handleLine]);
    const sendAfterClose = (line: string) => {
      if (anchored) setPendingLine(line);
      else handleLine(line);
    };

    const putDraft = useCallback((d: Draft) => {
      draftRef.current = d;
      requests.current += 1;
      setDraft(d);
    }, []);

    const setDraftAndMenu = useCallback(
      (d: Draft) => {
        if (defOf(overlayRef.current)?.mask === true) {
          putDraft(d);
          if (menuRef.current !== null) putMenu(null);
          return;
        }
        const before = paletteQuery(draftRef.current.text);
        putDraft(d);
        putHistory(settle(historyRef.current));
        const q = paletteQuery(d.text);
        const m = menuRef.current;
        if (q !== null) {
          // A new query starts at the top and drops any arrow-key choice; a cursor-only move keeps it.
          const same = m?.kind === 'palette' && before === q;
          putMenu(same ? m : { kind: 'palette', selected: 0, moved: false });
        } else if (m !== null) {
          // Typing on past a completion menu invalidates it, as well as leaving the palette.
          putMenu(null);
        }
      },
      [putDraft, putHistory, putMenu, defOf]
    );
    setDraftRef.current = (text: string) => {
      putArmed(null);
      setDraftAndMenu(atEnd(text));
    };

    useEffect(() => {
      // Re-armed on every run, so a StrictMode double-invoke does not leave the app disposed.
      disposed.current = false;
      appAbort.current = new AbortController();
      const disposers: { module: string; fn: () => void }[] = [];
      for (const m of registry.modules) {
        guard(m.id, () => {
          const dispose = m.init?.(ctxFor(m.id) as ModuleCtx<never>);
          if (dispose) disposers.push({ module: m.id, fn: dispose });
        });
      }
      return () => {
        disposed.current = true;
        if (toastTimer.current !== null) clearTimeout(toastTimer.current);
        if (noticeTimer.current !== null) clearTimeout(noticeTimer.current);
        appAbort.current.abort();
        for (const f of flights.current.values()) f.ac.abort();
        for (const d of disposers) guard(d.module, d.fn);
      };
    }, [ctxFor, guard]);

    const commands = useMemo(() => [...registry.commands.values()].map((c) => c.spec), []);
    const rowsFor = (text: string) =>
      paletteRows(
        commands.filter((c) => unavailableReason(c) === null),
        paletteQuery(text) ?? ''
      );
    const paletteFor = (text: string) => rowsFor(text).map((r) => r.cmd);
    const paletteItems = menu?.kind === 'palette' ? paletteFor(draft.text) : [];
    // A menu draws at most a panel's outer rows less its hint line and its own row padding, so
    // opening it cannot push the conversation off a short terminal. Outer, not panelSize: a
    // panel's insets are not a menu's.
    const menuRows = Math.max(1, panelOuter.rows - 1 - 2 * OVERLAY_PAD_Y);

    useInput((input, inkKey) => {
      const key: Key = { ...inkKey, input };
      const draft = draftRef.current;
      const menu = menuRef.current;
      const overlay = overlayRef.current;
      const history = historyRef.current;
      const armedOn = armedRef.current;
      const state: KeyState = {
        overlay: overlay ? { module: overlay.module, panel: overlay.panel } : null,
        menu: menu?.kind ?? null,
        draftEmpty: draft.text === '',
        armed:
          armedOn !== null &&
          overlay?.module === armedOn.module &&
          overlay.panel === armedOn.panel &&
          draft.text === armedOn.key
            ? armedOn.key
            : null
      };
      const route = resolveKey(state, key, registry);
      switch (route.kind) {
        case 'exit-chord': {
          const verdict = ctrlC(armedAt.current, Date.now());
          if (verdict === 'exit') {
            appAbort.current.abort();
            exit();
          } else {
            armedAt.current = Date.now();
            // The exit chord is a reach for the door, not a confirmation: it disarms.
            putArmed(null);
            if (band) showNotice(exitHint, CTRL_C_WINDOW_MS);
            else showToast(exitHint, 'dim', CTRL_C_WINDOW_MS);
          }
          return;
        }
        case 'menu': {
          if (menu === null) return;
          const items = menu.kind === 'palette' ? paletteFor(draft.text) : menu.items;
          const count = items.length;
          if (count === 0 && route.act !== 'move') {
            // An empty menu has nothing to pick: Enter sends the line as typed.
            putMenu(null);
            if (route.act === 'run') {
              putDraft(EMPTY_DRAFT);
              sendAfterClose(draft.text);
            }
            return;
          }
          if (route.act === 'move') {
            putMenu({
              ...menu,
              selected: moveSelection(menu.selected, route.delta, count),
              ...(menu.kind === 'palette' ? { moved: true } : {})
            } as Menu);
          } else if (route.act === 'close') {
            putMenu(null);
          } else if (menu.kind === 'palette') {
            const rows = rowsFor(draft.text);
            const c =
              route.act === 'run'
                ? enterRuns(rows, menu.selected, menu.moved)
                : rows[clampSelection(menu.selected, count)]?.cmd;
            if (c === undefined) return;
            if (c === null) {
              // A substring-only row the user never moved to: send the line as typed.
              putMenu(null);
              putDraft(EMPTY_DRAFT);
              sendAfterClose(draft.text);
            } else if (route.act === 'run' && c.args.every((a) => a.optional === true)) {
              // Nothing it needs is missing, so Enter runs it bare; Tab still fills `/name ` for
              // an argument.
              putMenu(null);
              putDraft(EMPTY_DRAFT);
              sendAfterClose(`/${c.name}`);
            } else {
              putMenu(null);
              putDraft(atEnd(completeDraft(c)));
            }
          } else {
            const s = menu.items[clampSelection(menu.selected, count)];
            if (s === undefined) return;
            const next = applySuggestion(draft.text, draft.cursor, s);
            putMenu(null);
            putDraft({ text: next.text, cursor: next.cursor });
          }
          return;
        }
        case 'panel': {
          const def = registry.panels.get(`${route.module}/${route.panel}`)?.def;
          const handler = def?.on?.[route.act];
          if (!handler || !overlay) return;
          let next: unknown;
          try {
            next = handler(overlay.state, ctxFor(route.module) as ModuleCtx<unknown>);
          } catch (err) {
            guard(route.module, () => {
              throw err;
            });
            return;
          }
          // The handler may have closed or replaced the panel: its state is only for this one.
          const cur = overlayRef.current;
          if (next !== undefined && cur?.module === overlay.module && cur.panel === overlay.panel) {
            putOverlay({ ...cur, state: next });
          }
          return;
        }
        case 'panel-close': {
          // The draft keeps whatever was typed, an armed letter included: closing never loses text.
          putArmed(null);
          const def = overlay
            ? registry.panels.get(`${overlay.module}/${overlay.panel}`)?.def
            : undefined;
          if (overlay && def?.escape) {
            // An input panel may stay open, abandoning an edit instead.
            let next: unknown;
            try {
              next = def.escape(overlay.state, ctxFor(overlay.module) as ModuleCtx<unknown>);
            } catch (err) {
              guard(overlay.module, () => {
                throw err;
              });
              return;
            }
            const cur = overlayRef.current;
            const same = cur?.module === overlay.module && cur.panel === overlay.panel;
            if (next !== undefined && same) {
              putOverlay({ ...cur, state: next });
              return;
            }
            // The handler opened another panel (a stage hand-off): closing now would lose it.
            if (!same) return;
          }
          putOverlay(null);
          return;
        }
        case 'confirm': {
          const def = registry.panels.get(`${route.module}/${route.panel}`)?.def;
          const handler = def?.on?.[route.act];
          if (!handler || !overlay) return;
          let next: unknown;
          try {
            next = handler(overlay.state, ctxFor(route.module) as ModuleCtx<unknown>);
          } catch (err) {
            guard(route.module, () => {
              throw err;
            });
            return;
          }
          // The act ran: consume the armed key. A handler that throws leaves the draft intact,
          // so Enter can retry.
          putArmed(null);
          putDraft(EMPTY_DRAFT);
          const cur = overlayRef.current;
          if (next !== undefined && cur?.module === overlay.module && cur.panel === overlay.panel) {
            putOverlay({ ...cur, state: next });
          }
          return;
        }
        case 'global':
          guard(route.module, () =>
            registry.globals.get(route.key)?.binding.run(ctxFor(route.module) as ModuleCtx<unknown>)
          );
          return;
        case 'cancel-turn': {
          const newest = [...flights.current.keys()].pop();
          const f = newest === undefined ? undefined : flights.current.get(newest);
          if (f) {
            f.ac.abort();
            f.land({ kind: CANCELLED_KIND, data: 'cancelled' });
          }
          return;
        }
        case 'history': {
          if (defOf(overlay)?.mask === true) return;
          putArmed(null);
          const step = walk(history, route.dir, draft.text);
          if (step === null) return;
          putHistory(step.state);
          putDraft(atEnd(step.text));
          return;
        }
        case 'submit': {
          putArmed(null);
          const line = draft.text;
          putDraft(EMPTY_DRAFT);
          putMenu(null);
          handleLine(line);
          return;
        }
        case 'complete': {
          if (defOf(overlay)?.mask === true) return;
          const completers = registry.completers.map((c) => c.completer);
          requests.current += 1;
          const ticket = requests.current;
          void mergeCompletions(completers, draft.text, draft.cursor).then((items) => {
            if (requests.current !== ticket) return;
            if (items.length === 1 && items[0]) {
              const next = applySuggestion(draft.text, draft.cursor, items[0]);
              putDraft({ text: next.text, cursor: next.cursor });
            } else if (items.length > 1) {
              putMenu({ kind: 'completion', items, selected: 0 });
            }
          });
          return;
        }
        case 'edit': {
          // A confirm key typed on an empty draft arms its act; any other edit disarms.
          const focused = overlay
            ? registry.panels.get(`${overlay.module}/${overlay.panel}`)?.def
            : undefined;
          const hit =
            overlay && draft.text === '' && !key.ctrl && !key.meta
              ? focused?.confirm?.find((c) => c.key === input)
              : undefined;
          putArmed(
            overlay && hit
              ? {
                  module: overlay.module,
                  panel: overlay.panel,
                  key: hit.key,
                  act: hit.act,
                  label: hit.label,
                  state: overlay.state
                }
              : null
          );
          if ([...input].length <= 1) {
            const edited = editKey(draft, input, key);
            if (edited !== null) {
              setDraftAndMenu(edited);
              return;
            }
          }
          if (input === '') return;
          const r = insertChunk(draft, input);
          setDraftAndMenu(r.draft);
          // A masked panel's lines are secrets: once one closes or replaces the panel, the rest
          // of the chunk would route as turns or commands, so it is dropped.
          const masked = defOf(overlay)?.mask === true ? overlay : null;
          for (const line of r.submit) {
            const cur = overlayRef.current;
            if (
              masked !== null &&
              (cur === null || cur.module !== masked.module || cur.panel !== masked.panel)
            ) {
              break;
            }
            handleLine(line);
          }
          return;
        }
        case 'ignore':
          return;
      }
    });

    // Bracketed paste is one draft line and never an Enter: a paste may contain `/commands`.
    // Piped, unbracketed chunks still submit through insertChunk in useInput.
    usePaste((text) => {
      putArmed(null);
      const open = overlayRef.current;
      // A panel takes no paste, unless it keeps the draft live.
      const def =
        open === null ? undefined : registry.panels.get(`${open.module}/${open.panel}`)?.def;
      if (open !== null && !((def?.confirm?.length ?? 0) > 0 || def?.submit !== undefined)) {
        return;
      }
      const line = pasteToLine(text);
      if (line === '') return;
      setDraftAndMenu(insertChunk(draftRef.current, line).draft);
    });

    const renderReply = (reply: Reply): ReactNode => {
      if (reply.kind === ERROR_KIND)
        return (
          <Text color={theme.color.error}>
            {theme.glyph.fail} {sanitise(String(reply.data))}
          </Text>
        );
      if (reply.kind === CANCELLED_KIND) return <Text color={theme.color.dim}>cancelled</Text>;
      const r = registry.renderers.get(reply.kind);
      return r ? (
        <Safe
          module={r.module}
          theme={theme}
          render={() => r.render({ data: reply.data, theme, size: { columns: width } })}
        />
      ) : (
        <Text>{sanitise(String(reply.data))}</Text>
      );
    };
    const chips = (reply: Reply): ReactNode => {
      if (!reply.chips || reply.chips.length === 0) return null;
      const seen = new Map<string, number>();
      const kids: ReactNode[] = [];
      for (const c of reply.chips) {
        const tone = c.tone ?? 'dim';
        const n = (seen.get(`${tone}:${c.label}`) ?? 0) + 1;
        seen.set(`${tone}:${c.label}`, n);
        if (kids.length > 0) kids.push(' · ');
        kids.push(
          <Text key={`${tone}:${c.label}#${n}`} color={theme.color[tone]}>
            {sanitise(c.label)}
          </Text>
        );
      }
      return <Text>{kids}</Text>;
    };

    const panel = overlay
      ? registry.panels.get(`${overlay.module}/${overlay.panel}`)?.def
      : undefined;

    const shownDraft = panel?.mask === true ? maskDraft(draft) : draft;
    const under = graphemeAt(shownDraft.text, shownDraft.cursor);
    // A turn still waiting: its latest pending update through its renderer, else a spinner; through
    // the app's waiting view when it has one.
    const waiting = (f: HeldAsk, held: boolean): ReactNode => {
      const reply = live.get(f.id);
      const body = reply ? (
        renderReply(reply)
      ) : (
        <Text color={theme.color.dim}>{spinnerFrame(Math.floor(Date.now() / 120))} Thinking</Text>
      );
      if (waitingView) {
        return (
          <Safe
            module="app"
            theme={theme}
            render={() =>
              waitingView({
                flight: f,
                held,
                ...(reply === undefined ? {} : { reply }),
                body,
                theme,
                size: { columns: width }
              })
            }
          />
        );
      }
      if (held) return body;
      return (
        <Box>
          <Text color={theme.color.accent}>⟨{f.mark}⟩ </Text>
          {body}
        </Box>
      );
    };
    // A committed transcript entry; the Static wrapper adds the gutter.
    const committed = (e: Entry<Reply>): ReactElement => {
      if (e.kind === 'ask') {
        if (askView) {
          return (
            <Safe
              key={e.key}
              module="app"
              theme={theme}
              render={() => askView({ entry: e, held: false, theme, size: { columns: width } })}
            />
          );
        }
        return (
          <Text key={e.key} color={theme.color.accent}>
            {e.mark !== null ? `⟨${e.mark}⟩ ` : ''}
            {theme.glyph.prompt} {sanitise(e.question)}
          </Text>
        );
      }
      if (e.kind === 'answer') {
        const body = (
          <>
            {renderReply(e.reply)}
            {chips(e.reply)}
          </>
        );
        if (answerView) {
          return (
            <Safe
              key={e.key}
              module="app"
              theme={theme}
              render={() => answerView({ entry: e, body, theme, size: { columns: width } })}
            />
          );
        }
        return (
          <Box key={e.key} flexDirection="column">
            {e.mark !== null ? <Text color={theme.color.accent}>↩ ⟨{e.mark}⟩</Text> : null}
            {body}
          </Box>
        );
      }
      if (e.kind === 'note') {
        if (noteView) {
          return (
            <Safe
              key={e.key}
              module="app"
              theme={theme}
              render={() => noteView({ entry: e, theme, size: { columns: width } })}
            />
          );
        }
        return (
          <Text key={e.key} color={theme.color[e.tone ?? 'dim']}>
            {sanitise(e.text)}
          </Text>
        );
      }
      return <Text key={e.key}>{'\n'.repeat(Math.max(0, e.lines - 1))}</Text>;
    };
    // What this epoch's `Static` prints: past a capped re-lay, a note for what it left out, then
    // the rest. Fixed per epoch, so the list only ever grows at its end.
    const printed: Entry<Reply>[] =
      reprintFrom === 0
        ? (transcript.committed as Entry<Reply>[])
        : [
            {
              key: `trimmed:${epoch}`,
              kind: 'note',
              text: `… ${reprintFrom} earlier ${reprintFrom === 1 ? 'entry' : 'entries'} not reprinted`,
              tone: 'dim'
            },
            ...transcript.committed.slice(reprintFrom)
          ];
    return (
      <Box flexDirection="column">
        <Static key={`static:${epoch}`} items={printed}>
          {(e) => (
            <Printed key={e.key} id={e.key} heights={heights.current} paddingX={gutter}>
              {committed(e)}
            </Printed>
          )}
        </Static>
        <Box ref={liveRef} flexDirection="row" paddingX={gutter}>
          <Box flexDirection="column" flexGrow={1}>
            {/* Turns whose asks are printed above with a mark, still waiting. Older first. */}
            {markedFlights(transcript).map((f) => (
              <Box key={`marked:${f.id}`}>{waiting(f, false)}</Box>
            ))}
            {heldAsks(transcript).map((f) => (
              <Box key={f.id} flexDirection="column">
                {askView ? (
                  <Safe
                    module="app"
                    theme={theme}
                    render={() =>
                      askView({ entry: f, held: true, theme, size: { columns: width } })
                    }
                  />
                ) : (
                  <Text color={theme.color.accent}>
                    {theme.glyph.prompt} {sanitise(f.question)}
                  </Text>
                )}
                {waiting(f, true)}
              </Box>
            ))}
            {panel && overlay ? (
              <Box
                backgroundColor={theme.color.raised}
                paddingX={PANEL_PAD_X}
                paddingY={PANEL_PAD_Y}
                flexDirection="column"
              >
                <Safe
                  key={`${overlay.module}/${overlay.panel}`}
                  module={overlay.module}
                  theme={theme}
                  render={() =>
                    panel.view({
                      state: overlay.state,
                      theme,
                      size: panelSize,
                      ...(armed !== null &&
                      armed.module === overlay.module &&
                      armed.panel === overlay.panel &&
                      draft.text === armed.key
                        ? { armed: { key: armed.key, label: armed.label } }
                        : {})
                    })
                  }
                />
              </Box>
            ) : null}
            {menu?.kind === 'palette' ? (
              <MenuList
                theme={theme}
                rows={paletteItems.map((c) => ({
                  key: c.name,
                  name: commandUsage(c),
                  detail: c.summary
                }))}
                selected={menu.selected}
                height={menuRows}
                empty={`no command matches ${draft.text}`}
                hint="tab complete · enter run · esc close"
              />
            ) : null}
            {menu?.kind === 'completion' ? (
              <MenuList
                theme={theme}
                rows={menu.items.map((s) => ({
                  key: s.insert,
                  name: s.label,
                  detail: s.detail ?? ''
                }))}
                selected={menu.selected}
                height={menuRows}
                empty="no completions"
                hint="tab complete · esc close"
              />
            ) : null}
            {band ? (
              <Box
                borderStyle="bold"
                borderTop={false}
                borderRight={false}
                borderBottom={false}
                borderColor={theme.color.edge}
                backgroundColor={theme.color.surfaceAlt}
                paddingX={1}
                paddingY={1}
                flexDirection="column"
              >
                {/* No prompt glyph in the band: its edge and the block cursor mark the input. */}
                <Text>
                  {shownDraft.text.slice(0, shownDraft.cursor)}
                  {under === '' ? (
                    <Text color={theme.color.cursor}>█</Text>
                  ) : (
                    <Text inverse>{under}</Text>
                  )}
                  {under === '' ? '' : shownDraft.text.slice(shownDraft.cursor + under.length)}
                </Text>
                <Box marginTop={1}>
                  {presence ? (
                    <Box flexShrink={0}>
                      <Text bold>{sanitise(presence.name)} </Text>
                    </Box>
                  ) : null}
                  <Box flexGrow={1} minWidth={0}>
                    <Text color={theme.color.dim} wrap="truncate">
                      {presence?.view ? (
                        <Safe
                          module={presenceModule}
                          theme={theme}
                          render={() => presence.view?.({ theme })}
                        />
                      ) : null}
                    </Text>
                  </Box>
                  <Box flexShrink={0} paddingLeft={notice === null ? 0 : 2}>
                    <Text color={theme.color.warn}>{notice ?? ' '}</Text>
                  </Box>
                </Box>
              </Box>
            ) : (
              <Text>
                <Text color={theme.color.accent}>{theme.glyph.prompt} </Text>
                {shownDraft.text}
              </Text>
            )}
            {toast ? <Text color={theme.color[toast.tone]}>{toast.text}</Text> : null}
            <Box {...(band ? { marginTop: 1 } : {})}>
              {registry.status.map((s) => (
                <Box key={`${s.module}:${s.item.id}`} marginRight={2}>
                  <Safe module={s.module} theme={theme} render={() => s.item.view({ theme })} />
                </Box>
              ))}
              {[...status.entries()].map(([k, v]) => (
                <Text key={k} color={theme.color[v.tone]}>
                  {v.text}{' '}
                </Text>
              ))}
            </Box>
          </Box>
          {showRail ? (
            <Box flexDirection="column" width={RAIL_COLUMNS - 1} marginLeft={1}>
              {registry.rail.map((r) => (
                <Box key={`${r.module}:${r.item.id}`}>
                  <Safe module={r.module} theme={theme} render={() => r.item.view({ theme })} />
                </Box>
              ))}
            </Box>
          ) : null}
        </Box>
      </Box>
    );
  }

  return {
    registry,
    App,
    async run() {
      // Ground, clear and anchor the terminal before the first frame: the app's own re-lays only
      // redo a pane that was prepared this way.
      const prepare = runTerminalOptions(opts);
      const restore = prepare === null ? () => {} : prepareTerminal(process.stdout, prepare);
      const instance = render(<App />, { exitOnCtrlC: false });
      await instance.waitUntilExit();
      restore();
    }
  };
}
