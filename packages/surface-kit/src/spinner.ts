// The spinner on the in-stream Thinking line (interaction grammar §7): this turn is alive.
//
// The braille ring is the default, by the operator's choice over the box chase. One cell wide in
// every frame, so the word beside it never shifts.
//
// Pure, so the sequence is tested rather than eyeballed; the component supplies the frame.

/** Clockwise: ▘ top-left → ▝ top-right → ▗ bottom-right → ▖ bottom-left. */
export const BOX_CHASE = ['▘', '▝', '▗', '▖'] as const;

/** A gap running round a ring of eight braille dots. The default — see the header. */
export const BRAILLE_RING = ['⣾', '⣽', '⣻', '⢿', '⡿', '⣟', '⣯', '⣷'] as const;

export const SPINNER: readonly string[] = BRAILLE_RING;

export function spinnerFrame(frame: number, frames: readonly string[] = SPINNER): string {
  if (frames.length === 0) return '';
  const i = ((Math.floor(frame) % frames.length) + frames.length) % frames.length;
  return frames[i] as string;
}
