import { describe, expect, it } from 'vitest';
import { sanitise } from '../src/sanitise.js';

describe('sanitise', () => {
  const table: [string, string, string][] = [
    ['CSI colour', '\u001b[31mred\u001b[0m', 'red'],
    ['OSC title, BEL terminated', '\u001b]0;x\u0007hi', 'hi'],
    ['OSC title, ST terminated', '\u001b]0;x\u001b\\hi', 'hi'],
    ['bare BEL', 'a\u0007b', 'ab'],
    ['8-bit CSI', '\u009b31mhi', 'hi'],
    ['newline kept', 'a\nb', 'a\nb'],
    ['tab becomes a space', 'a\tb', 'a b'],
    ['carriage return and NUL dropped', 'a\rb\u0000c', 'abc'],
    ['plain unicode untouched', 'héllo 世界', 'héllo 世界'],
    ['backspace dropped', 'ab\u0008c', 'abc'],
    ['lone ESC', 'a\u001b', 'a']
  ];
  for (const [name, input, want] of table) {
    it(name, () => expect(sanitise(input)).toBe(want));
  }
});
