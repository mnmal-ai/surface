/** A typed or pasted chunk applied to the draft: complete lines are submitted, the rest kept. */
export function applyInput(draft: string, chunk: string): { draft: string; submit: string[] } {
  if (!/[\r\n]/.test(chunk)) return { draft: draft + chunk, submit: [] };
  const parts = (draft + chunk).split(/\r\n|\r|\n/);
  const rest = parts.pop() ?? '';
  const submit = parts.map((p) => p.trim()).filter((p) => p !== '');
  return { draft: rest, submit };
}
