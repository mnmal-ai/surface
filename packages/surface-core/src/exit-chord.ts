// Leaving takes two ctrl-c presses, close together: terminal copy is ctrl-shift-c, and one missed
// shift key must not end the session.
//
// The first press arms and shows a hint; a second within the window leaves. After the window it
// disarms by itself, so a stray press long ago cannot make a later single press fatal.
// The draft is deliberately left alone: a press meant to copy must not cost what was typed.

export const CTRL_C_WINDOW_MS = 1500;

/** What a ctrl-c press does, given when (if ever) the previous one armed the exit. */
export function ctrlC(
  armedAt: number | null,
  now: number,
  windowMs: number = CTRL_C_WINDOW_MS
): 'exit' | 'arm' {
  return armedAt !== null && now - armedAt <= windowMs ? 'exit' : 'arm';
}
