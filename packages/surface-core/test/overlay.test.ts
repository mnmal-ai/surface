import { describe, expect, it } from 'vitest';
import { type Overlay, panelOf, setPanel } from '../src/overlay.js';

type Panels = { why: { token: number }; offers: { selected: number } };
const why = (token: number): Overlay<Panels> => ({ kind: 'why', panel: { token } });

describe('one panel at a time', () => {
  it('opening a panel replaces the one that was open', () => {
    const o = setPanel<Panels, 'offers'>(why(1), 'offers', { selected: 0 });
    expect(o).toEqual({ kind: 'offers', panel: { selected: 0 } });
    expect(panelOf(o, 'why')).toBeNull();
  });

  it('closing a panel that is not open leaves the open one alone', () => {
    const o = why(1);
    expect(setPanel<Panels, 'offers'>(o, 'offers', null)).toBe(o);
  });

  it('closing the open panel closes it', () => {
    expect(setPanel<Panels, 'why'>(why(1), 'why', null)).toBeNull();
  });

  it('an updater sees its own panel, or null when another is open', () => {
    const seen: unknown[] = [];
    setPanel<Panels, 'why'>(why(1), 'why', (w) => {
      seen.push(w);
      return w;
    });
    setPanel<Panels, 'offers'>(why(1), 'offers', (v) => {
      seen.push(v);
      return v;
    });
    expect(seen).toEqual([{ token: 1 }, null]);
  });

  it('a slow read for a panel that has since been replaced changes nothing', () => {
    // The /why pattern: land only if the token still matches, else hand back what was given.
    const o: Overlay<Panels> = { kind: 'offers', panel: { selected: 2 } };
    const landed = setPanel<Panels, 'why'>(o, 'why', (w) => (w?.token === 1 ? { token: 1 } : w));
    expect(landed).toBe(o);
  });

  it('an updater that opens from nothing opens', () => {
    const o = setPanel<Panels, 'why'>(null, 'why', (w) => ({ token: (w?.token ?? 0) + 1 }));
    expect(o).toEqual({ kind: 'why', panel: { token: 1 } });
  });
});
