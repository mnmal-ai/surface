/**
 * One panel at a time, by construction. The open panel is one value, a tagged union, so
 * opening any panel closes whichever was open and two can never stack. The component keeps
 * per-panel views of it (`panelOf`) and per-panel setters (`setPanel`) with React's own
 * contract: a value or an updater, `null` to close.
 */

/** The open panel: which one, and its state. `null` when none is. */
export type Overlay<P> = { [K in keyof P]: { kind: K; panel: P[K] } }[keyof P] | null;

/** A panel's state when it is the one open, else `null`. */
export function panelOf<P, K extends keyof P>(o: Overlay<P>, kind: K): P[K] | null {
  return o !== null && o.kind === kind ? (o.panel as P[K]) : null;
}

/**
 * The overlay after one panel's setter ran. The updater sees this panel's state, or `null`
 * when another panel (or none) is open, exactly as a per-panel `useState` would have shown it.
 *
 * - A value opens this panel and replaces whatever was open.
 * - `null` closes this panel only if it is the one open. Closing a panel that is not open
 *   must not close the one that is.
 * - An updater returning what it was given changes nothing. That is how a slow read landing
 *   for a panel that has since closed, or been replaced, is dropped.
 */
export function setPanel<P, K extends keyof P>(
  o: Overlay<P>,
  kind: K,
  next: P[K] | null | ((current: P[K] | null) => P[K] | null)
): Overlay<P> {
  const current = panelOf(o, kind);
  const value =
    typeof next === 'function' ? (next as (c: P[K] | null) => P[K] | null)(current) : next;
  if (value === current) return o;
  if (value === null) return current === null ? o : null;
  return { kind, panel: value } as Overlay<P>;
}
