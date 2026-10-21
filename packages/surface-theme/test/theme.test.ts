import { describe, expect, it } from 'vitest';
import { defaultTheme, marathon, type Theme, TONES, threshold } from '../src/index.js';

const themes: Theme[] = [defaultTheme, marathon];

describe('themes', () => {
  it.each(themes.map((t) => [t.name, t] as const))('%s defines every tone and glyph', (_, t) => {
    for (const tone of TONES) expect(t.color[tone], tone).toMatch(/\S/);
    for (const g of [
      'title',
      'query',
      'mutation',
      'live',
      'ok',
      'fail',
      'cursor',
      'barFull',
      'barEmpty',
      'prompt'
    ] as const) {
      expect(t.glyph[g], g).toMatch(/\S/);
    }
    expect(t.glyph.spark.length).toBeGreaterThanOrEqual(2);
  });

  it('marathon carries the V1 palette', () => {
    expect(marathon.color).toEqual({
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
      edge: '#FF2D2D',
      cursor: '#00FFFF',
      selection: '#FF2D2D',
      raised: '#24262A'
    });
    expect(marathon.glyph.query).toBe('▸');
    expect(marathon.glyph.mutation).toBe('◆');
  });
});

it('marathon raises overlays above the input band', () => {
  expect(marathon.color.raised).not.toBe(marathon.color.surfaceAlt);
});

describe('threshold', () => {
  const bands = [
    { below: 20, tone: 'ok' as const },
    { below: 100, tone: 'warn' as const }
  ];
  it('picks the first band the value is below, else the over tone', () => {
    expect(threshold(5, bands, 'error')).toBe('ok');
    expect(threshold(20, bands, 'error')).toBe('warn');
    expect(threshold(250, bands, 'error')).toBe('error');
  });
});
