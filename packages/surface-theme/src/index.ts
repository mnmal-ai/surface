/** Semantic colours. Modules and kit name a TONE; only a theme names a colour. */
export const TONES = [
  'accent',
  'accentAlt',
  'ok',
  'warn',
  'error',
  'info',
  'dim',
  'dimMid',
  'text',
  'query',
  'mutation',
  'spark',
  'surface',
  'surfaceAlt',
  /** The operator's marked lines: the input band's edge (and the ask echo if a theme chooses). */
  'edge',
  /** The input cursor block. */
  'cursor',
  /** The selected row's ground in menus (the / palette, completions); its text is `surface`. */
  'selection',
  /** The ground of overlays (panels, the / palette, completions): a step above the input band. */
  'raised'
] as const;
export type Tone = (typeof TONES)[number];

export interface Glyphs {
  readonly title: string;
  readonly query: string;
  readonly mutation: string;
  readonly live: string;
  readonly ok: string;
  readonly fail: string;
  readonly cursor: string;
  readonly barFull: string;
  readonly barEmpty: string;
  readonly prompt: string;
  readonly spark: readonly string[];
}

export interface Theme {
  readonly name: string;
  readonly color: Readonly<Record<Tone, string>>;
  readonly glyph: Glyphs;
}

/** The tone of the first band `value` is below, else `over`. Bands ascend. */
export function threshold(
  value: number,
  bands: readonly { readonly below: number; readonly tone: Tone }[],
  over: Tone
): Tone {
  for (const b of bands) if (value < b.below) return b.tone;
  return over;
}

const SPARK = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'] as const;

/** Named terminal colours: readable on any palette the terminal already has. */
export const defaultTheme: Theme = {
  name: 'default',
  color: {
    accent: 'cyan',
    accentAlt: 'magenta',
    ok: 'green',
    warn: 'yellow',
    error: 'red',
    info: 'blue',
    dim: 'gray',
    dimMid: 'gray',
    text: 'white',
    query: 'cyan',
    mutation: 'magenta',
    spark: 'magenta',
    surface: 'black',
    surfaceAlt: 'blackBright',
    edge: 'cyan',
    cursor: 'cyan',
    selection: 'cyan',
    // No named colour sits above blackBright: the inset padding carries the separation here.
    raised: 'blackBright'
  },
  glyph: {
    title: '■',
    query: '›',
    mutation: '*',
    live: '●',
    ok: '✓',
    fail: '✗',
    cursor: '▶',
    barFull: '█',
    barEmpty: '░',
    prompt: '›',
    spark: SPARK
  }
};

/**
 * Marathon: after Bungie's Marathon: neon-on-black, high contrast).
 */
export const marathon: Theme = {
  name: 'marathon',
  color: {
    accent: '#00FFFF',
    accentAlt: '#FF00FF',
    ok: '#00FF41',
    warn: '#FFFF00',
    error: '#FF2D2D',
    info: '#4FC3F7',
    dim: '#444466',
    dimMid: '#666688',
    text: '#E0E0FF',
    query: '#00FFFF',
    mutation: '#FF00FF',
    spark: '#BF5FFF',
    surface: '#0A0A0F',
    surfaceAlt: '#0D1117',
    // The input band reads malevolent: a bright red edge.
    edge: '#FF2D2D',
    cursor: '#00FFFF',
    // Menu selection in the band's red, so a picked command reads as the band's.
    selection: '#FF2D2D',
    // surfaceAlt mixed 15% toward white so overlays lift off the band, then darkened twice by
    // 15% (each channel × 0.85, operator 2026-10-09): it lifted further than it needed to.
    raised: '#24262A'
  },
  glyph: {
    title: '◈',
    query: '▸',
    mutation: '◆',
    live: '●',
    ok: '✓',
    fail: '✗',
    cursor: '▶',
    barFull: '█',
    barEmpty: '░',
    prompt: '▸',
    spark: SPARK
  }
};

/** The terminal background an app sets with `prepareTerminal` (surface-core): black. */
export const DEFAULT_GROUND = '#000000';
