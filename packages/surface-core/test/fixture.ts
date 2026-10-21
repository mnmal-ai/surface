import { defineModule, type TurnUpdate } from '../src/index.js';

/** Echoes after a pending update. 'slow …' waits 60ms, so a later fast turn overtakes it. */
export const echo = defineModule('fixture.echo', {
  turns: [
    {
      id: 'echo',
      claims: () => 1,
      async *answer(text: string): AsyncIterable<TurnUpdate> {
        yield { phase: 'pending', reply: { kind: 'fixture.text', data: '…' } };
        if (text.startsWith('slow')) await new Promise((r) => setTimeout(r, 60));
        if (text === 'boom') throw new Error('handler exploded');
        yield {
          phase: 'final',
          reply: { kind: 'fixture.text', data: `echo: ${text}`, chips: [{ label: 'fixture' }] }
        };
      }
    }
  ],
  renderers: { 'fixture.text': ({ data }) => String(data) }
});

export const panels = defineModule<{ info: { count: number } }>('fixture.panels', {
  commands: [
    {
      name: 'hello',
      summary: 'print a note',
      args: [],
      run: (_, ctx) => ctx.print('hello from a command')
    },
    {
      name: 'info',
      summary: 'open the info panel',
      args: [],
      run: (_, ctx) => ctx.open('info', { count: 0 })
    }
  ],
  panels: {
    info: {
      view: ({ state }) => `info count=${state.count}`,
      keymap: [{ key: '+', act: 'inc' }],
      on: { inc: (s) => ({ count: s.count + 1 }) }
    }
  },
  completers: [
    {
      id: 'words',
      complete: (d) => (d.endsWith('ap') ? [{ label: 'apple', insert: 'apple' }] : [])
    }
  ],
  rail: [{ id: 'rail', view: () => 'RAIL' }],
  status: [{ id: 'st', view: () => 'STATUS-ITEM' }],
  keymap: [{ key: 'ctrl+p', run: (ctx) => ctx.print('global fired') }]
});
