import { describe, expect, it } from 'vitest';
import * as core from '../src/index.js';

describe('barrel', () => {
  it('exports the lifted helpers consumers import', () => {
    for (const name of [
      'pasteToLine',
      'wordLeft',
      'wordRight',
      'maskDraft',
      'mayWalk',
      'HISTORY_MAX',
      'applyInput',
      'moveSelection',
      'clampSelection',
      'sanitise',
      'normaliseKeySpec',
      'createApp'
    ]) {
      expect(core, name).toHaveProperty(name);
    }
  });
});
