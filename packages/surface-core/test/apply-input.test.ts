import { describe, expect, it } from 'vitest';
import { applyInput } from '../src/apply-input.js';

// The core's paste and typing rule, held to what a consumer's input relies on.
describe('applyInput', () => {
  it('accumulates a character at a time, the way typing arrives', () => {
    expect(applyInput('Orbi', 't')).toEqual({ draft: 'Orbit', submit: [] });
  });

  it('SUBMITS A WHOLE LINE ARRIVING AS ONE CHUNK — a paste, or a driver script', () => {
    // `printf 'Do I own any Orbital?\r'` arrives as a single value ending in \r, so neither
    // Ink's key.return nor an `input === '\r'` test matches. Found by driving the built
    // binary in a pty: the session typed itself into the draft line and never sent anything.
    expect(applyInput('', 'Do I own any Orbital?\r')).toEqual({
      draft: '',
      submit: ['Do I own any Orbital?']
    });
  });

  it('handles a newline as well as a carriage return', () => {
    expect(applyInput('', 'hello\n')).toEqual({ draft: '', submit: ['hello'] });
    expect(applyInput('', 'hello\r\n')).toEqual({ draft: '', submit: ['hello'] });
  });

  it('submits several lines and keeps the unterminated tail', () => {
    expect(applyInput('', 'one\rtwo\rthree')).toEqual({
      draft: 'three',
      submit: ['one', 'two']
    });
  });

  it('completes a line the draft had started', () => {
    expect(applyInput('Do I own ', 'it?\r')).toEqual({ draft: '', submit: ['Do I own it?'] });
  });

  it('drops empty lines, so a stray newline is not a turn', () => {
    expect(applyInput('', '\r')).toEqual({ draft: '', submit: [] });
    expect(applyInput('  ', '\r')).toEqual({ draft: '', submit: [] });
  });
});
