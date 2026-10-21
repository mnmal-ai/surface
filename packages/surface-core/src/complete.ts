import type { Completer, Suggestion } from './module.js';

const TIMEOUT_MS = 150;
const LIMIT = 8;

async function within<T>(work: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    return await Promise.race([work, timeout]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Every completer at once; a slow or failing one is dropped, never waited on. */
export async function mergeCompletions(
  completers: readonly Completer[],
  draft: string,
  cursor: number,
  opts: { timeoutMs?: number; limit?: number } = {}
): Promise<Suggestion[]> {
  const ms = opts.timeoutMs ?? TIMEOUT_MS;
  const results = await Promise.all(
    completers.map((c) =>
      within(
        Promise.resolve().then(() => c.complete(draft, cursor)),
        ms
      )
    )
  );
  const byInsert = new Map<string, Suggestion>();
  for (const list of results) {
    for (const s of list ?? []) {
      const key = s.replace ? `${s.insert}\0${s.replace[0]},${s.replace[1]}` : s.insert;
      const prior = byInsert.get(key);
      if (prior === undefined || (s.score ?? 0) > (prior.score ?? 0)) byInsert.set(key, s);
    }
  }
  const merged = [...byInsert.values()];
  merged.sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.label.localeCompare(b.label));
  return merged.slice(0, opts.limit ?? LIMIT);
}

function validSpan(
  span: readonly [number, number] | undefined,
  length: number
): span is readonly [number, number] {
  if (span === undefined) return false;
  const [start, end] = span;
  return (
    Number.isInteger(start) && Number.isInteger(end) && 0 <= start && start <= end && end <= length
  );
}

/**
 * Replace the suggestion's `replace` span with its insert, or, without a valid one, the
 * whitespace-delimited token ending at `cursor`. The cursor lands after the insert.
 */
export function applySuggestion(
  draft: string,
  cursor: number,
  s: Suggestion
): { text: string; cursor: number } {
  if (validSpan(s.replace, draft.length)) {
    const [start, end] = s.replace;
    return {
      text: draft.slice(0, start) + s.insert + draft.slice(end),
      cursor: start + s.insert.length
    };
  }
  const before = draft.slice(0, cursor);
  const start = before.search(/\S+$/);
  const from = start < 0 ? cursor : start;
  const text = draft.slice(0, from) + s.insert + draft.slice(cursor);
  return { text, cursor: from + s.insert.length };
}
