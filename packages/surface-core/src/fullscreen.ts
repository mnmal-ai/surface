// Full-screen mode as data: whether it is on, and where the transcript viewport is scrolled.

/** Whether full-screen is on: `SURFACE_FULLSCREEN` (`on` / `off`) over the app's option over on. */
export function resolveFullscreen(
  option: boolean | undefined,
  env: string | undefined
): { readonly on: boolean; readonly invalid: string | null } {
  const fallback = option ?? true;
  const v = env?.trim().toLowerCase() ?? '';
  if (v === 'on') return { on: true, invalid: null };
  if (v === 'off') return { on: false, invalid: null };
  return { on: fallback, invalid: v === '' ? null : (env ?? null) };
}

/** Where the viewport is: following the bottom (`held: null`), or held with this top row. */
export interface Scroll {
  readonly held: number | null;
}

export const FOLLOWING: Scroll = { held: null };

const bottomTop = (content: number, viewport: number): number => Math.max(0, content - viewport);

/** The first content row shown. A held top past the end (the terminal grew) is clamped. */
export function viewTop(s: Scroll, content: number, viewport: number): number {
  const bottom = bottomTop(content, viewport);
  return s.held === null ? bottom : Math.min(Math.max(0, s.held), bottom);
}

/** Content rows below the viewport. */
export function linesBelow(s: Scroll, content: number, viewport: number): number {
  return bottomTop(content, viewport) - viewTop(s, content, viewport);
}

/** Scrolls by `delta` rows (negative is up). Reaching the bottom follows again. */
export function scrollBy(s: Scroll, delta: number, content: number, viewport: number): Scroll {
  const bottom = bottomTop(content, viewport);
  const top = Math.min(Math.max(0, viewTop(s, content, viewport) + delta), bottom);
  return top >= bottom ? FOLLOWING : { held: top };
}

/** A PgUp/PgDn step: a viewport less one row of overlap, never under one. */
export function pageStep(viewport: number): number {
  return Math.max(1, viewport - 1);
}
