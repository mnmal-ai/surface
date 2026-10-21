import { describe, expect, it } from 'vitest';
import { composeModules } from '../src/compose.js';
import { defineModule } from '../src/module.js';
import { parseCommandLine } from '../src/palette.js';
import { routeInput, unavailableReason } from '../src/route-input.js';

const none = async function* () {};
const m = defineModule('test.r', {
  commands: [{ name: 'hello', summary: 'h', args: [], run: () => {} }],
  turns: [
    { id: 'low', claims: () => 1, answer: none },
    { id: 'urls', claims: (t) => (t.startsWith('http') ? 9 : false), answer: none }
  ]
});
const reg = composeModules([m]);

describe('routeInput', () => {
  it('sends /name to the command registry', () => {
    const r = routeInput('/hello world', reg);
    expect(r).toMatchObject({ kind: 'command', module: 'test.r', args: ['world'] });
  });
  it('reports an unknown command rather than treating it as a turn', () => {
    expect(routeInput('/nope', reg)).toEqual({ kind: 'unknown-command', name: 'nope' });
  });
  it('an unavailable command routes as unavailable-command with its reason', () => {
    const locked = composeModules([
      defineModule('m', {
        commands: [
          { name: 'x', summary: 's', args: [], unavailable: () => 'locked', run: () => {} }
        ]
      })
    ]);
    expect(routeInput('/x', locked)).toEqual({
      kind: 'unavailable-command',
      name: 'x',
      reason: 'locked'
    });
  });
  it('an unavailable thunk returning undefined (a loose JS consumer) leaves the command available', () => {
    const loose = composeModules([
      defineModule('m', {
        commands: [
          {
            name: 'x',
            summary: 's',
            args: [],
            unavailable: (() => undefined) as unknown as () => string | null,
            run: () => {}
          }
        ]
      })
    ]);
    expect(routeInput('/x', loose)).toMatchObject({ kind: 'command' });
    expect(unavailableReason(loose.commands.get('x')!.spec)).toBeNull();
  });
  it('an empty-string reason is still unavailable, with the reason `unavailable`', () => {
    const blank = composeModules([
      defineModule('m', {
        commands: [{ name: 'x', summary: 's', args: [], unavailable: () => '', run: () => {} }]
      })
    ]);
    expect(routeInput('/x', blank)).toEqual({
      kind: 'unavailable-command',
      name: 'x',
      reason: 'unavailable'
    });
  });
  it('picks the highest claim; ties go to registration order', () => {
    expect(routeInput('http://x', reg)).toMatchObject({ kind: 'turn', handler: { id: 'urls' } });
    expect(routeInput('hello', reg)).toMatchObject({ kind: 'turn', handler: { id: 'low' } });
    const tied = composeModules([
      defineModule('test.t', {
        turns: [
          { id: 'first', claims: () => 2, answer: none },
          { id: 'second', claims: () => 2, answer: none }
        ]
      })
    ]);
    expect(routeInput('x', tied)).toMatchObject({ kind: 'turn', handler: { id: 'first' } });
  });
  it('falls back to the default handler, else no-handler', () => {
    const quiet = composeModules([
      defineModule('test.q', { turns: [{ id: 'never', claims: () => false, answer: none }] })
    ]);
    expect(routeInput('hi', quiet, 'test.q:never')).toMatchObject({
      kind: 'turn',
      handler: { id: 'never' }
    });
    expect(routeInput('hi', quiet)).toEqual({ kind: 'no-handler' });
  });
  it('treats a claims() that throws as not claiming', () => {
    const bad = composeModules([
      defineModule('test.b', {
        turns: [
          {
            id: 'boom',
            claims: () => {
              throw new Error('x');
            },
            answer: none
          },
          { id: 'ok', claims: () => 1, answer: none }
        ]
      })
    ]);
    expect(routeInput('hi', bad)).toMatchObject({ kind: 'turn', handler: { id: 'ok' } });
  });
  it('only a bare slash word is a command, matched case-insensitively', () => {
    for (const text of ['/usr/share/music', '/r/techno']) {
      expect(routeInput(text, reg)).toMatchObject({ kind: 'turn', handler: { id: 'low' } });
    }
    expect(parseCommandLine('/prs extra args')).toEqual({ name: 'prs', args: ['extra', 'args'] });
    expect(parseCommandLine('/Foo')).toEqual({ name: 'foo', args: [] });
  });
  it('edge inputs: bare slash and double slash', () => {
    expect(routeInput('/', reg)).toMatchObject({ kind: 'turn', handler: { id: 'low' } });
    expect(routeInput('//text', reg)).toMatchObject({ kind: 'turn', handler: { id: 'low' } });
  });
});
