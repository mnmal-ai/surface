import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const made = [];

// Builds a packages/ tree from { 'surface-kit/src/a.ts': 'source' } and returns its root.
function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'surface-guards-'));
  made.push(root);
  for (const [rel, text] of Object.entries(files)) {
    const file = join(root, rel);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  return root;
}
const run = (script, root) =>
  spawnSync(process.execPath, [join(here, script), root], { encoding: 'utf8' }).status;

after(() => {
  for (const d of made) rmSync(d, { recursive: true, force: true });
});

describe('no-domain-imports', () => {
  const imports = {
    'from-import': "import { x } from '@mnmal-ai/substrate-client';",
    'side-effect import': "import '@mnmal-ai/substrate-types';",
    'dynamic import()': "const m = await import('@mnmal-ai/synoptic');",
    'require()': "const m = require('@mnmal-ai/cortext');"
  };
  for (const [name, src] of Object.entries(imports)) {
    it(`flags ${name}`, () => {
      assert.equal(run('no-domain-imports.mjs', fixture({ 'surface-kit/src/a.ts': src })), 1);
    });
  }
  it('allows substrate-config and sibling surface packages', () => {
    const src =
      "import { c } from '@mnmal-ai/substrate-config';\nimport '@mnmal-ai/surface-theme';";
    assert.equal(run('no-domain-imports.mjs', fixture({ 'surface-kit/src/a.ts': src })), 0);
  });
});

describe('no-raw-hex', () => {
  it('flags hex inside a larger string', () => {
    const root = fixture({ 'surface-kit/src/a.ts': "export const s = '#ff00ff bold';" });
    assert.equal(run('no-raw-hex.mjs', root), 1);
  });
  it('flags hex inside a template literal', () => {
    const root = fixture({ 'surface-core/src/a.ts': 'export const s = `color: #fff`;' });
    assert.equal(run('no-raw-hex.mjs', root), 1);
  });
  it('ignores hex in surface-theme', () => {
    const root = fixture({ 'surface-theme/src/a.ts': "export const c = '#ff00ff';" });
    assert.equal(run('no-raw-hex.mjs', root), 0);
  });
  it('ignores issue refs in comments and non-hex-length tokens', () => {
    const src = "// #123 issue\n/* see #abc */\nexport const s = 'issue #1234';";
    assert.equal(run('no-raw-hex.mjs', fixture({ 'surface-kit/src/a.ts': src })), 0);
  });
});

describe('no-ink-in-pure', () => {
  it('flags a pure entry that imports ink', () => {
    const root = fixture({
      'surface-core/dist/pure.js': "import { Box } from 'ink';\nexport {};",
      'surface-kit/dist/cells.js': 'export {};',
      'surface-kit/dist/text.js': 'export {};'
    });
    assert.equal(run('no-ink-in-pure.mjs', root), 1);
  });
  it('flags react/jsx-runtime reached through a shared chunk', () => {
    const root = fixture({
      'surface-core/dist/pure.js': "export * from './chunk.js';",
      'surface-core/dist/chunk.js': "import { jsx } from 'react/jsx-runtime';\nexport {};",
      'surface-kit/dist/cells.js': 'export {};',
      'surface-kit/dist/text.js': 'export {};'
    });
    assert.equal(run('no-ink-in-pure.mjs', root), 1);
  });
  it('flags a pure entry that imports a sibling package root (its barrel loads Ink)', () => {
    const root = fixture({
      'surface-core/dist/pure.js':
        "import { spinnerFrame } from '@mnmal-ai/surface-kit';\nexport {};",
      'surface-kit/dist/cells.js': 'export {};',
      'surface-kit/dist/text.js': 'export {};'
    });
    assert.equal(run('no-ink-in-pure.mjs', root), 1);
  });
  it('allows a sibling pure subpath', () => {
    const root = fixture({
      'surface-core/dist/pure.js':
        "import { cellWidth } from '@mnmal-ai/surface-kit/cells';\nexport {};",
      'surface-kit/dist/cells.js': 'export {};',
      'surface-kit/dist/text.js': 'export {};'
    });
    assert.equal(run('no-ink-in-pure.mjs', root), 0);
  });
  it('passes when pure entries only import siblings and string-width', () => {
    const root = fixture({
      'surface-core/dist/pure.js': "import './a.js';\nexport {};",
      'surface-core/dist/a.js': "import w from 'string-width';\nexport {};",
      'surface-kit/dist/cells.js': "import w from 'string-width';\nexport {};",
      'surface-kit/dist/text.js': 'export {};'
    });
    assert.equal(run('no-ink-in-pure.mjs', root), 0);
  });
});
