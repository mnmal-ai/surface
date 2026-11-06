// Ink-free entry: everything in the root barrel except createApp. Guarded by scripts/no-ink-in-pure.mjs.
export { applyInput } from './apply-input.js';
export { applySuggestion, mergeCompletions } from './complete.js';
export {
  assertComposes,
  CompositionError,
  composeModules,
  RESERVED_GLOBAL_KEYS,
  type Registry
} from './compose.js';
export {
  atEnd,
  type Draft,
  type EditKeys,
  EMPTY_DRAFT,
  editKey,
  insertChunk,
  maskDraft,
  pasteToLine,
  wordLeft,
  wordRight
} from './editor.js';
export { CTRL_C_WINDOW_MS, ctrlC } from './exit-chord.js';
export {
  FOLLOWING,
  linesBelow,
  pageStep,
  resolveFullscreen,
  type Scroll,
  scrollBy,
  viewTop
} from './fullscreen.js';
export {
  EMPTY_HISTORY,
  HISTORY_MAX,
  type HistoryState,
  mayWalk,
  remember,
  settle,
  walk
} from './history.js';
export { normaliseKeySpec } from './key-spec.js';
export { type KeyState, keySpecOf, type Route, resolveKey } from './keys.js';
export {
  back,
  backspace,
  cursorRow,
  type DetailStep,
  endFilter,
  type ListDetail,
  type ListHooks,
  type ListStep,
  listStep,
  move,
  type PagerState,
  pagerAt,
  placement,
  push,
  type RelatedLoadingStep,
  type Step,
  scrollDetail,
  startFilter,
  turn,
  typeChar,
  visibleRows
} from './list-pager-state.js';
export {
  type ArgSpec,
  type Armed,
  type Chip,
  type CommandSpec,
  type Completer,
  type ConfirmBinding,
  defineModule,
  type GlobalBinding,
  type Key,
  type KeySpec,
  type ModuleCtx,
  type ModuleSpec,
  type PanelDef,
  type PresenceSpec,
  type RailItem,
  type Renderer,
  type Reply,
  type Size,
  type SubmitOptions,
  type Suggestion,
  type TuiEvents,
  type TuiModule,
  type TurnContext,
  type TurnHandler,
  type TurnPhase,
  type TurnUpdate
} from './module.js';
export { type Overlay, panelOf, setPanel } from './overlay.js';
export {
  clampSelection,
  commandUsage,
  completeDraft,
  enterRuns,
  MENU_NAME_WIDTH,
  menuWindow,
  moveSelection,
  type PaletteRow,
  paletteMatches,
  paletteQuery,
  paletteRows,
  parseCommandLine
} from './palette.js';
export { type InputRoute, routeInput } from './route-input.js';
export { sanitise } from './sanitise.js';
export {
  anchorPadding,
  CLEAR_PANE,
  DEFAULT_GROUND,
  groundSequence,
  type LiveMeasure,
  liveShrink,
  type PrepareTerminalOptions,
  prepareSequence,
  prepareTerminal,
  RESET_GROUND,
  reflowSequence,
  type TerminalOut,
  type TerminalProcess,
  WHEEL_ARROWS_OFF,
  WHEEL_ARROWS_ON
} from './terminal.js';
export {
  type AnswerEntry,
  type AppEntry,
  type AskEntry,
  addGap,
  answerEntry,
  arriveTurn,
  commitEntry,
  type Entry,
  emptyTranscript,
  type Flight,
  type GapEntry,
  heldAsks,
  markedFlights,
  type NoteEntry,
  sendTurn,
  type Transcript
} from './transcript.js';
