import { describe, expect, it } from 'vitest';
import {
  addGap,
  answerEntry,
  arriveTurn,
  commitEntry,
  emptyTranscript,
  heldAsks,
  markedFlights,
  sendTurn,
  type Transcript
} from '../src/transcript.js';

type R = { text: string };
const reply = (text: string): R => ({ text });
const kinds = (t: { committed: readonly { kind: string; mark?: number | null }[] }) =>
  t.committed.map(
    (e) => `${e.kind}${'mark' in e && e.mark !== null && e.mark !== undefined ? `⟨${e.mark}⟩` : ''}`
  );

const lines = (t: Transcript<R>): string[] =>
  t.committed.map((e) => {
    if (e.kind === 'note') return `· ${e.text}`;
    if (e.kind === 'gap') return `(${e.lines} blank)`;
    const m = e.mark === null ? '' : ` ⟨${e.mark}⟩`;
    return e.kind === 'ask' ? `> ${e.question}${m}` : `< ${e.reply.text}${m}`;
  });

describe('turn engine (the interaction grammar)', () => {
  it('holds an ask until its answer arrives, then commits both, unmarked', () => {
    let t = sendTurn(emptyTranscript<R>(), 1, 'q1');
    expect(t.committed).toEqual([]);
    expect(heldAsks(t).map((f) => f.question)).toEqual(['q1']);
    t = arriveTurn(t, 1, reply('a1'));
    expect(kinds(t)).toEqual(['ask', 'answer']);
    expect(heldAsks(t)).toEqual([]);
  });

  it('answers in order produce no marks', () => {
    let t = sendTurn(sendTurn(emptyTranscript<R>(), 1, 'q1'), 2, 'q2');
    t = arriveTurn(t, 1, reply('a1'));
    t = arriveTurn(t, 2, reply('a2'));
    expect(kinds(t)).toEqual(['ask', 'answer', 'ask', 'answer']);
  });

  it('an overtaken ask is printed marked, and its late answer carries the same mark', () => {
    let t = sendTurn(sendTurn(emptyTranscript<R>(), 1, 'slow'), 2, 'fast');
    t = arriveTurn(t, 2, reply('fast answer'));
    expect(kinds(t)).toEqual(['ask⟨1⟩', 'ask', 'answer']);
    expect(markedFlights(t).map((f) => f.id)).toEqual([1]);
    t = arriveTurn(t, 1, reply('slow answer'));
    expect(kinds(t)).toEqual(['ask⟨1⟩', 'ask', 'answer', 'answer⟨1⟩']);
    expect(answerEntry(t, 1)?.reply).toEqual(reply('slow answer'));
  });

  it('ignores a duplicate or unknown arrival', () => {
    let t = arriveTurn(sendTurn(emptyTranscript<R>(), 1, 'q'), 1, reply('a'));
    const before = t;
    t = arriveTurn(t, 1, reply('again'));
    expect(t).toBe(before);
    expect(arriveTurn(t, 99, reply('x'))).toBe(before);
  });

  it('a note commits above held asks, never between an ask and its answer', () => {
    let t = sendTurn(emptyTranscript<R>(), 1, 'q');
    t = commitEntry(t, { key: 'note:1', kind: 'note', text: 'hello' });
    t = arriveTurn(t, 1, reply('a'));
    expect(kinds(t)).toEqual(['note', 'ask', 'answer']);
  });

  it('carries an app-specific entry kind through X', () => {
    type Mine = { key: string; kind: 'remembered'; text: string };
    const t = commitEntry(emptyTranscript<R, Mine>(), {
      key: 'r:1',
      kind: 'remembered',
      text: 'x'
    });
    expect(t.committed[0]?.kind).toBe('remembered');
  });
  it('answering a later turn marks every earlier held ask, in send order, and leaves later ones held', () => {
    let t = sendTurn(sendTurn(sendTurn(emptyTranscript<R>(), 1, 'a'), 2, 'b'), 3, 'c');
    t = arriveTurn(t, 2, reply('b!'));
    expect(kinds(t)).toEqual(['ask⟨1⟩', 'ask', 'answer']);
    expect(heldAsks(t).map((f) => f.id)).toEqual([3]);
    expect(markedFlights(t).map((f) => f.id)).toEqual([1]);
  });

  it('an already-marked ask is not marked or committed again by a later overtake', () => {
    let t = sendTurn(sendTurn(sendTurn(emptyTranscript<R>(), 1, 'a'), 2, 'b'), 3, 'c');
    t = arriveTurn(t, 2, reply('b!'));
    t = arriveTurn(t, 3, reply('c!'));
    expect(kinds(t)).toEqual(['ask⟨1⟩', 'ask', 'answer', 'ask', 'answer']);
    t = arriveTurn(t, 1, reply('a!'));
    expect(kinds(t).at(-1)).toBe('answer⟨1⟩');
    expect(markedFlights(t)).toEqual([]);
  });

  it('marks number up across the session and are never reused', () => {
    let t = sendTurn(sendTurn(emptyTranscript<R>(), 1, 'a'), 2, 'b');
    t = arriveTurn(t, 2, reply('b!'));
    t = arriveTurn(t, 1, reply('a!'));
    t = arriveTurn(sendTurn(sendTurn(t, 3, 'c'), 4, 'd'), 4, reply('d!'));
    expect(kinds(t).filter((k) => k.includes('⟨'))).toEqual(['ask⟨1⟩', 'answer⟨1⟩', 'ask⟨2⟩']);
  });

  it('answerEntry(null) returns the last answer; a missing mark returns null', () => {
    let t = sendTurn(emptyTranscript<R>(), 1, 'a');
    expect(answerEntry(t, null)).toBeNull();
    t = arriveTurn(t, 1, reply('a!'));
    expect(answerEntry(t, null)?.reply).toEqual(reply('a!'));
    expect(answerEntry(t, 7)).toBeNull();
  });

  it('carries emphasis from send onto the ask entry', () => {
    const t = arriveTurn(sendTurn(emptyTranscript<R>(), 1, 'q', 'em'), 1, reply('a'));
    expect(t.committed[0]).toMatchObject({ kind: 'ask', emphasis: 'em' });
  });

  it('addGap commits a gap, and ignores zero lines', () => {
    const t = emptyTranscript<R>();
    expect(addGap(t, 0, 1)).toBe(t);
    expect(addGap(t, 2, 5).committed[0]).toMatchObject({ kind: 'gap', lines: 2, epoch: 5 });
  });
  it('marks every earlier ask overtaken at once, numbered in send order', () => {
    let t = sendTurn(emptyTranscript<R>(), 1, 'A');
    t = sendTurn(t, 2, 'B');
    t = sendTurn(t, 3, 'C');
    t = arriveTurn(t, 3, reply('C'));
    expect(lines(t)).toEqual(['> A ⟨1⟩', '> B ⟨2⟩', '> C', '< C']);
    t = arriveTurn(t, 2, reply('B'));
    t = arriveTurn(t, 1, reply('A'));
    expect(lines(t).slice(-2)).toEqual(['< B ⟨2⟩', '< A ⟨1⟩']);
  });

  it('keeps `committed` append-only, which is what Static requires', () => {
    let t = sendTurn(emptyTranscript<R>(), 1, 'A');
    t = sendTurn(t, 2, 'B');
    t = arriveTurn(t, 2, reply('B'));
    const before = [...t.committed];
    t = arriveTurn(t, 1, reply('A'));
    expect(t.committed.slice(0, before.length)).toEqual(before);
  });

  it('keeps `committed` an exact prefix across a mixed send/arrive/commit/gap sequence', () => {
    const steps: ((t: Transcript<R>) => Transcript<R>)[] = [
      (t) => sendTurn(t, 1, 'A'),
      (t) => sendTurn(t, 2, 'B'),
      (t) => sendTurn(t, 3, 'C'),
      (t) => commitEntry(t, { key: 'note:1', kind: 'note', text: 'n' }),
      (t) => arriveTurn(t, 3, reply('C')),
      (t) => addGap(t, 2, 1),
      (t) => arriveTurn(t, 1, reply('A')),
      (t) => arriveTurn(t, 1, reply('dup')),
      (t) => arriveTurn(t, 2, reply('B'))
    ];
    let t = emptyTranscript<R>();
    for (const step of steps) {
      const before = t.committed;
      t = step(t);
      expect(t.committed.slice(0, before.length)).toEqual(before);
      expect(t.committed.length).toBeGreaterThanOrEqual(before.length);
    }
    expect(t.committed.length).toBeGreaterThan(0);
  });
});
