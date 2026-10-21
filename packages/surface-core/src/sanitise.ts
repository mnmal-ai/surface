// Text the core renders itself may come from a module, a handler's error or a command line, and a
// terminal obeys escape sequences in it (title set, cursor moves, clipboard writes). Strip them.
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching control characters is the point
const OSC = /(?:\u001b\]|\u009d)[^\u0007\u001b\u009c]*(?:\u0007|\u009c|\u001b\\)?/g;
// biome-ignore lint/suspicious/noControlCharactersInRegex: as above
const CSI = /(?:\u001b\[|\u009b)[0-?]*[ -/]*[@-~]?/g;
// biome-ignore lint/suspicious/noControlCharactersInRegex: as above
const ESC_PAIR = /\u001b[ -~]?/g;
// biome-ignore lint/suspicious/noControlCharactersInRegex: as above
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g;

/** Strips ESC sequences and C0/C1 control characters; keeps `\n`, and a tab becomes a space. */
export function sanitise(text: string): string {
  return text
    .replace(/\t/g, ' ')
    .replace(OSC, '')
    .replace(CSI, '')
    .replace(ESC_PAIR, '')
    .replace(CONTROL, '');
}
