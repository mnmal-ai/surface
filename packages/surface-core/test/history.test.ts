import { describe, expect, it } from 'vitest';
import { EMPTY_HISTORY, HISTORY_MAX, mayWalk, remember, settle, walk } from '../src/history.js';

const withTurns = (...lines: string[]) => lines.reduce(remember, EMPTY_HISTORY);

describe('turn history', () => {
  it('walks up through previous turns, newest first, and stops at the oldest', () => {
    let h = withTurns('first', 'second', 'third');
    const steps: string[] = [];
    for (let i = 0; i < 4; i++) {
      const s = walk(h, 'up', 'half typed');
      if (s === null) break;
      h = s.state;
      steps.push(s.text);
    }
    expect(steps).toEqual(['third', 'second', 'first']);
  });

  // Operator, 2026-09-23: "we shouldn't keep `/<slash>` commands in the history - it breaks the
  // flow of going back to a conversation turn."
  it('keeps only conversation turns — a slash command between them is never walked to', () => {
    let h = withTurns('what new links have you made?', '/lists movie night', '/why', 'thanks');
    expect(h.entries).toEqual(['what new links have you made?', 'thanks']);
    h = walk(h, 'up', '')?.state ?? h;
    const back = walk(h, 'up', 'thanks');
    expect(back?.text).toBe('what new links have you made?');
  });

  it('sending a slash command still ends a walk, so the next ↑ starts from the newest turn', () => {
    let h = withTurns('first', 'second');
    h = walk(h, 'up', '')?.state ?? h;
    h = walk(h, 'up', 'second')?.state ?? h;
    expect(h.at).toBe(0);
    h = remember(h, '/lists');
    expect(h.at).toBeNull();
    expect(walk(h, 'up', '')?.text).toBe('second');
  });

  it('walking back down returns the draft he was typing', () => {
    let h = withTurns('first', 'second');
    h = walk(h, 'up', 'half typed')?.state ?? h;
    h = walk(h, 'up', 'second')?.state ?? h;
    const down1 = walk(h, 'down', 'first');
    expect(down1?.text).toBe('second');
    const down2 = walk(down1?.state ?? h, 'down', 'second');
    expect(down2?.text).toBe('half typed');
    expect(down2?.state.at).toBeNull();
    expect(walk(down2?.state ?? h, 'down', 'half typed')).toBeNull();
  });

  it('keeps no blanks and no straight repeats, and is bounded', () => {
    expect(withTurns('a', '  ', 'a', 'b').entries).toEqual(['a', 'b']);
    const many = Array.from({ length: HISTORY_MAX + 20 }, (_, i) => `turn ${i}`);
    const h = withTurns(...many);
    expect(h.entries).toHaveLength(HISTORY_MAX);
    expect(h.entries[0]).toBe('turn 20');
  });

  it('editing a recalled line makes it his draft; sending it adds a NEW entry', () => {
    let h = withTurns('what is on movie night');
    h = walk(h, 'up', '')?.state ?? h;
    h = settle(h);
    expect(h.at).toBeNull();
    h = remember(h, "what's left on movie night");
    expect(h.entries).toEqual(['what is on movie night', "what's left on movie night"]);
  });

  it('in a multi-line draft, walks only from the first line (up) or the last (down)', () => {
    const draft = 'line one\nline two';
    expect(mayWalk(draft, 3, 'up')).toBe(true);
    expect(mayWalk(draft, 12, 'up')).toBe(false);
    expect(mayWalk(draft, 12, 'down')).toBe(true);
    expect(mayWalk(draft, 3, 'down')).toBe(false);
    expect(mayWalk('single', 2, 'up')).toBe(true);
  });

  it('with no history the arrows do nothing', () => {
    expect(walk(EMPTY_HISTORY, 'up', 'x')).toBeNull();
  });
});
