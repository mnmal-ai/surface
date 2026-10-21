import { describe, expect, it } from 'vitest';
import { composeModules } from '../src/compose.js';
import { type KeyState, keySpecOf, resolveKey } from '../src/keys.js';
import { defineModule } from '../src/module.js';

const mod = defineModule<{ list: Record<string, never> }>('test.k', {
  panels: { list: { view: () => null, keymap: [{ key: 'a', act: 'approve' }] } },
  keymap: [{ key: 'ctrl+p', run: () => {} }]
});
const reg = composeModules([mod]);
const idle: KeyState = { overlay: null, menu: null, draftEmpty: true };

describe('keySpecOf', () => {
  it('normalises Ink flags to a spec', () => {
    expect(keySpecOf({ input: 'p', ctrl: true })).toBe('ctrl+p');
    expect(keySpecOf({ input: '', escape: true })).toBe('escape');
    expect(keySpecOf({ input: '', upArrow: true })).toBe('up');
    expect(keySpecOf({ input: 'a' })).toBe('a');
  });
});

describe('resolveKey precedence', () => {
  it('ctrl+c is always the exit chord, even with a panel open', () => {
    expect(
      resolveKey(
        { ...idle, overlay: { module: 'test.k', panel: 'list' } },
        { input: 'c', ctrl: true },
        reg
      )
    ).toEqual({ kind: 'exit-chord' });
  });
  it('an open menu owns navigation keys', () => {
    const s: KeyState = { ...idle, menu: 'palette' };
    expect(resolveKey(s, { input: '', downArrow: true }, reg)).toEqual({
      kind: 'menu',
      act: 'move',
      delta: 1
    });
    expect(resolveKey(s, { input: '', tab: true }, reg)).toEqual({ kind: 'menu', act: 'accept' });
    expect(resolveKey(s, { input: '', escape: true }, reg)).toEqual({ kind: 'menu', act: 'close' });
    expect(resolveKey(s, { input: 'x' }, reg)).toEqual({ kind: 'edit' });
  });
  it('a focused panel gets its keys; escape closes it; other keys are swallowed', () => {
    const s: KeyState = { ...idle, overlay: { module: 'test.k', panel: 'list' } };
    expect(resolveKey(s, { input: 'a' }, reg)).toEqual({
      kind: 'panel',
      module: 'test.k',
      panel: 'list',
      act: 'approve'
    });
    expect(resolveKey(s, { input: '', escape: true }, reg)).toEqual({ kind: 'panel-close' });
    expect(resolveKey(s, { input: 'z' }, reg)).toEqual({ kind: 'ignore' });
  });
  it('then module globals, then cancel, history, submit, complete, edit', () => {
    expect(resolveKey(idle, { input: 'p', ctrl: true }, reg)).toEqual({
      kind: 'global',
      module: 'test.k',
      key: 'ctrl+p'
    });
    expect(resolveKey(idle, { input: '', escape: true }, reg)).toEqual({ kind: 'cancel-turn' });
    expect(resolveKey({ ...idle, draftEmpty: false }, { input: '', escape: true }, reg)).toEqual({
      kind: 'ignore'
    });
    expect(resolveKey(idle, { input: '', upArrow: true }, reg)).toEqual({
      kind: 'history',
      dir: 'up'
    });
    expect(resolveKey(idle, { input: '', return: true }, reg)).toEqual({ kind: 'submit' });
    expect(resolveKey(idle, { input: '', tab: true }, reg)).toEqual({ kind: 'complete' });
    expect(resolveKey(idle, { input: 'h' }, reg)).toEqual({ kind: 'edit' });
  });
});

describe('registry keys are canonical, so resolution agrees with composition', () => {
  it('a non-canonical global binding routes from the event it names', () => {
    const m = defineModule('test.canon', { keymap: [{ key: 'Ctrl+P', run: () => {} }] });
    const r = composeModules([m]);
    expect(resolveKey(idle, { input: 'p', ctrl: true }, r)).toEqual({
      kind: 'global',
      module: 'test.canon',
      key: 'ctrl+p'
    });
  });
  it('a panel binding written as space fires on a space keystroke', () => {
    const m = defineModule<{ list: Record<string, never> }>('test.space', {
      panels: { list: { view: () => null, keymap: [{ key: 'space', act: 'toggle' }] } }
    });
    const r = composeModules([m]);
    const s: KeyState = { ...idle, overlay: { module: 'test.space', panel: 'list' } };
    expect(resolveKey(s, { input: ' ' }, r)).toEqual({
      kind: 'panel',
      module: 'test.space',
      panel: 'list',
      act: 'toggle'
    });
  });
  it('menu navigation keys beat a focused panel keymap', () => {
    const m = defineModule<{ list: Record<string, never> }>('test.beat', {
      panels: { list: { view: () => null, keymap: [{ key: 'down', act: 'next' }] } }
    });
    const r = composeModules([m]);
    const s: KeyState = {
      overlay: { module: 'test.beat', panel: 'list' },
      menu: 'palette',
      draftEmpty: true
    };
    expect(resolveKey(s, { input: '', downArrow: true }, r)).toEqual({
      kind: 'menu',
      act: 'move',
      delta: 1
    });
  });
});

describe('a focused panel still sees module globals', () => {
  const m = defineModule<{ list: Record<string, never> }>('test.pg', {
    panels: { list: { view: () => null, keymap: [{ key: 'ctrl+o', act: 'panel-act' }] } },
    keymap: [
      { key: 'ctrl+p', run: () => {} },
      { key: 'ctrl+o', run: () => {} }
    ]
  });
  const r = composeModules([m]);
  const s: KeyState = { ...idle, overlay: { module: 'test.pg', panel: 'list' } };
  it('an unbound global routes to the global', () => {
    expect(resolveKey(s, { input: 'p', ctrl: true }, r)).toEqual({
      kind: 'global',
      module: 'test.pg',
      key: 'ctrl+p'
    });
  });
  it('the panel wins when both bind the same key', () => {
    expect(resolveKey(s, { input: 'o', ctrl: true }, r)).toEqual({
      kind: 'panel',
      module: 'test.pg',
      panel: 'list',
      act: 'panel-act'
    });
  });
  it('an unbound key is ignored, never history', () => {
    expect(resolveKey(s, { input: '', upArrow: true }, r)).toEqual({ kind: 'ignore' });
  });
});

describe('pasted text never resolves as a key', () => {
  const m = defineModule<{ list: Record<string, never> }>('test.paste', {
    panels: { list: { view: () => null, keymap: [{ key: 'up', act: 'u' }] } }
  });
  const r = composeModules([m]);
  const states: KeyState[] = [
    idle,
    { ...idle, menu: 'palette' },
    { ...idle, overlay: { module: 'test.paste', panel: 'list' } }
  ];
  for (const word of ['enter', 'ctrl+c', 'up']) {
    it(`pasted '${word}' edits, or is ignored behind a panel`, () => {
      for (const s of states) {
        const want = s.overlay !== null && s.menu === null ? 'ignore' : 'edit';
        expect(resolveKey(s, { input: word }, r)).toEqual({ kind: want });
      }
    });
  }
  it('keySpecOf is null for multi-character input', () => {
    expect(keySpecOf({ input: 'enter' })).toBeNull();
  });
});

describe('more precedence facts', () => {
  it('uppercase ctrl+C is the exit chord', () => {
    expect(resolveKey(idle, { input: 'C', ctrl: true }, reg)).toEqual({ kind: 'exit-chord' });
    expect(keySpecOf({ input: 'P', meta: true })).toBe('meta+p');
  });
  it('menu enter runs a palette entry and accepts a completion', () => {
    expect(resolveKey({ ...idle, menu: 'palette' }, { input: '', return: true }, reg)).toEqual({
      kind: 'menu',
      act: 'run'
    });
    expect(resolveKey({ ...idle, menu: 'completion' }, { input: '', return: true }, reg)).toEqual({
      kind: 'menu',
      act: 'accept'
    });
  });
  it('menu up moves -1', () => {
    expect(resolveKey({ ...idle, menu: 'palette' }, { input: '', upArrow: true }, reg)).toEqual({
      kind: 'menu',
      act: 'move',
      delta: -1
    });
  });
  it('ctrl+c with a menu open is the exit chord', () => {
    expect(resolveKey({ ...idle, menu: 'completion' }, { input: 'c', ctrl: true }, reg)).toEqual({
      kind: 'exit-chord'
    });
  });
});

describe('panel bindings on enter', () => {
  it('Enter in a focused panel runs the panel action (letter, then enter)', () => {
    const m = defineModule<{ pick: Record<string, never> }>('test.e', {
      panels: { pick: { view: () => null, keymap: [{ key: 'enter', act: 'choose' }] } }
    });
    const r = composeModules([m]);
    expect(
      resolveKey(
        { overlay: { module: 'test.e', panel: 'pick' }, menu: null, draftEmpty: true },
        { input: '', return: true },
        r
      )
    ).toEqual({ kind: 'panel', module: 'test.e', panel: 'pick', act: 'choose' });
  });
});

describe('a panel that confirms letters keeps the draft live', () => {
  const m = defineModule<{ review: Record<string, never>; plain: Record<string, never> }>(
    'test.c',
    {
      panels: {
        review: {
          view: () => null,
          keymap: [{ key: 'down', act: 'next' }],
          confirm: [{ key: 'a', act: 'approve', label: 'approves it' }],
          on: { approve: () => undefined, next: () => undefined }
        },
        plain: { view: () => null }
      }
    }
  );
  const r = composeModules([m]);
  const on = (panel: string, armed: string | null = null): KeyState => ({
    overlay: { module: 'test.c', panel },
    menu: null,
    draftEmpty: armed === null,
    armed
  });

  it('a confirm key, any other key and a paste all reach the draft', () => {
    expect(resolveKey(on('review'), { input: 'a' }, r)).toEqual({ kind: 'edit' });
    expect(resolveKey(on('review'), { input: 'x' }, r)).toEqual({ kind: 'edit' });
    expect(resolveKey(on('review'), { input: 'are you' }, r)).toEqual({ kind: 'edit' });
  });
  it('Enter runs the armed act, and otherwise sends the line as typed', () => {
    expect(resolveKey(on('review', 'a'), { input: '', return: true }, r)).toEqual({
      kind: 'confirm',
      module: 'test.c',
      panel: 'review',
      act: 'approve'
    });
    expect(resolveKey(on('review'), { input: '', return: true }, r)).toEqual({ kind: 'submit' });
  });
  it('its keymap and escape still come first', () => {
    expect(resolveKey(on('review'), { input: '', downArrow: true }, r)).toMatchObject({
      kind: 'panel',
      act: 'next'
    });
    expect(resolveKey(on('review', 'a'), { input: '', escape: true }, r)).toEqual({
      kind: 'panel-close'
    });
  });
  it('a panel without confirm still takes every key', () => {
    expect(resolveKey(on('plain'), { input: 'x' }, r)).toEqual({ kind: 'ignore' });
    expect(resolveKey(on('plain'), { input: '', return: true }, r)).toEqual({ kind: 'ignore' });
  });
});

describe('a panel that owns the input line keeps the draft live', () => {
  const m = defineModule<{ editor: Record<string, never> }>('test.s', {
    panels: { editor: { view: () => null, submit: () => undefined } }
  });
  const r = composeModules([m]);
  const on: KeyState = {
    overlay: { module: 'test.s', panel: 'editor' },
    menu: null,
    draftEmpty: false
  };
  it('typing and a paste reach the draft, and Enter submits', () => {
    expect(resolveKey(on, { input: 'm' }, r)).toEqual({ kind: 'edit' });
    expect(resolveKey(on, { input: 'milk and eggs' }, r)).toEqual({ kind: 'edit' });
    expect(resolveKey(on, { input: '', return: true }, r)).toEqual({ kind: 'submit' });
  });
});
