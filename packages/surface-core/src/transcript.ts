// The transcript as a pure state machine (generalised over the reply type R). Not turn-blocked: while one question is in
// flight another can be asked, and answers can arrive out of order. An answer adjacent to its
// ask carries no mark; one that cannot land adjacent carries ⟨n⟩, and so does its ask.
//
// Ink's Static writes each entry once and never redraws it, so an unanswered ask is held in the
// live region and committed only when its fate is decided:
//   - its own answer arrives          → ask and answer committed together, no mark
//   - a later-sent turn's answer      → the ask is committed with a mark first
//     arrives first
import type { Tone } from '@mnmal-ai/surface-theme';

export interface AskEntry {
  readonly key: string;
  readonly kind: 'ask';
  readonly question: string;
  readonly mark: number | null;
  readonly emphasis?: string;
}

export interface AnswerEntry<R> {
  readonly key: string;
  readonly kind: 'answer';
  readonly question: string;
  readonly reply: R;
  readonly mark: number | null;
  /** The far side started this line (a greeting, an offer); it answers no question. */
  readonly unprompted?: boolean;
  /** When an unprompted line landed, epoch ms. */
  readonly at?: number;
}

/** The surface speaking, not the conversation: a command's reply. */
export interface NoteEntry {
  readonly key: string;
  readonly kind: 'note';
  readonly text: string;
  readonly tone?: Tone;
}

/** Blank rows printed so the input returns to the bottom after the live region shrinks. */
export interface GapEntry {
  readonly key: string;
  readonly kind: 'gap';
  readonly lines: number;
  readonly epoch: number;
}

export type AppEntry = { readonly key: string; readonly kind: string };

export type Entry<R, X extends AppEntry = never> =
  | AskEntry
  | AnswerEntry<R>
  | NoteEntry
  | GapEntry
  | X;

export interface Flight {
  readonly id: number;
  readonly question: string;
  /** Null while the ask is held; set when a later answer overtook it and it was printed. */
  readonly mark: number | null;
  readonly emphasis?: string;
}

export interface Transcript<R, X extends AppEntry = never> {
  /** Append-only between re-lays: exactly what Static requires. A re-lay drops the gaps. */
  readonly committed: readonly Entry<R, X>[];
  /** Unanswered turns, in send order. */
  readonly flights: readonly Flight[];
  /** Marks number up for the whole session and never reset. */
  readonly nextMark: number;
}

export function emptyTranscript<R, X extends AppEntry = never>(): Transcript<R, X> {
  return { committed: [], flights: [], nextMark: 1 };
}

export function sendTurn<R, X extends AppEntry>(
  t: Transcript<R, X>,
  id: number,
  question: string,
  emphasis?: string
): Transcript<R, X> {
  const flight: Flight = {
    id,
    question,
    mark: null,
    ...(emphasis === undefined ? {} : { emphasis })
  };
  return { ...t, flights: [...t.flights, flight] };
}

function askOf(f: Flight, mark: number | null): AskEntry {
  return {
    key: `ask:${f.id}`,
    kind: 'ask',
    question: f.question,
    mark,
    ...(f.emphasis === undefined ? {} : { emphasis: f.emphasis })
  };
}

export function arriveTurn<R, X extends AppEntry>(
  t: Transcript<R, X>,
  id: number,
  reply: R
): Transcript<R, X> {
  const index = t.flights.findIndex((f) => f.id === id);
  if (index < 0) return t;
  const arriving = t.flights[index] as Flight;
  const committed: Entry<R, X>[] = [...t.committed];
  const flights: Flight[] = [];
  let nextMark = t.nextMark;

  t.flights.forEach((f, i) => {
    if (i === index) return;
    if (i < index && f.mark === null) {
      const mark = nextMark;
      nextMark += 1;
      committed.push(askOf(f, mark));
      flights.push({ ...f, mark });
      return;
    }
    flights.push(f);
  });

  const answer: AnswerEntry<R> = {
    key: `answer:${id}`,
    kind: 'answer',
    question: arriving.question,
    reply,
    mark: arriving.mark
  };
  if (arriving.mark === null) committed.push(askOf(arriving, null), answer);
  else committed.push(answer);
  return { committed, flights, nextMark };
}

export function heldAsks<R, X extends AppEntry>(t: Transcript<R, X>): readonly Flight[] {
  return t.flights.filter((f) => f.mark === null);
}

export function markedFlights<R, X extends AppEntry>(t: Transcript<R, X>): readonly Flight[] {
  return t.flights.filter((f) => f.mark !== null);
}

export function commitEntry<R, X extends AppEntry>(
  t: Transcript<R, X>,
  entry: Entry<R, NoInfer<X>>
): Transcript<R, X> {
  return { ...t, committed: [...t.committed, entry] };
}

/** The last answer printed, or the one carrying mark `n`. */
export function answerEntry<R, X extends AppEntry>(
  t: Transcript<R, X>,
  mark: number | null
): AnswerEntry<R> | null {
  for (let i = t.committed.length - 1; i >= 0; i -= 1) {
    const e = t.committed[i] as Entry<R, X> | undefined;
    if (
      e !== undefined &&
      e.kind === 'answer' &&
      (mark === null || (e as AnswerEntry<R>).mark === mark)
    ) {
      return e as AnswerEntry<R>;
    }
  }
  return null;
}

export function addGap<R, X extends AppEntry>(
  t: Transcript<R, X>,
  lines: number,
  epoch: number
): Transcript<R, X> {
  if (lines <= 0) return t;
  return commitEntry(t, { key: `gap:${t.committed.length}`, kind: 'gap', lines, epoch });
}

/** The transcript without its gaps: for a re-lay, which prints everything again from scratch. */
export function dropGaps<R, X extends AppEntry>(t: Transcript<R, X>): Transcript<R, X> {
  if (!t.committed.some((e) => e.kind === 'gap')) return t;
  return { ...t, committed: t.committed.filter((e) => e.kind !== 'gap') };
}
