#!/usr/bin/env node
// Pure entries must not reach Ink or React, even through a shared chunk: importing
// one would load chalk, which fixes colour depth on first import.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const PURE = {
  'surface-core': ['pure'],
  'surface-kit': ['cells', 'text']
};
// ink/react directly, or a sibling package's ROOT entry (its barrel loads Ink);
// a sibling's pure subpath (`@mnmal-ai/surface-kit/cells`) is fine.
const FORBIDDEN = /^(?:(?:ink|react)(?:\/.*)?|@mnmal-ai\/surface-(?:core|kit))$/;
// from '…', bare side-effect import '…', dynamic import('…'), require('…')
const SPEC = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)(['"])([^'"\n]+)\1/g;

const root = process.argv[2] ?? 'packages';
const bad = [];
const seen = new Set();

function scan(file, entry) {
  const abs = resolve(file);
  if (seen.has(abs)) return;
  seen.add(abs);
  if (!existsSync(abs)) {
    bad.push(`${file}: missing (imported from ${entry})`);
    return;
  }
  const text = readFileSync(abs, 'utf8');
  for (const m of text.matchAll(SPEC)) {
    const spec = m[2];
    if (FORBIDDEN.test(spec)) bad.push(`${file}: imports '${spec}' (reached from ${entry})`);
    else if (spec.startsWith('./') || spec.startsWith('../')) scan(join(dirname(abs), spec), entry);
  }
}

for (const [pkg, entries] of Object.entries(PURE)) {
  for (const name of entries) {
    seen.clear();
    const file = join(root, pkg, 'dist', `${name}.js`);
    scan(file, file);
  }
}
if (bad.length > 0) {
  console.error(`pure entries reach ink/react or a sibling root entry:\n  ${bad.join('\n  ')}`);
  process.exit(1);
}
console.log('pure entries are ink-free');
