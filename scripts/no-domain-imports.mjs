#!/usr/bin/env node
// The core owns mechanisms, never a domain: no package here may import substrate, cortext or synoptic.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// from '…', side-effect import '…', dynamic import('…') and require('…').
const FORBIDDEN =
  /(?:from\s*|import\s*\(?\s*|require\s*\(\s*)['"](@mnmal-ai\/(?:substrate(?!-config)|cortext|synoptic)[^'"]*)['"]/g;
const root = process.argv[2] ?? 'packages';
const bad = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx|mjs|js)$/.test(name)) {
      for (const m of readFileSync(p, 'utf8').matchAll(FORBIDDEN)) bad.push(`${p}: ${m[1]}`);
    }
  }
}
for (const pkg of readdirSync(root)) walk(join(root, pkg, 'src'));
if (bad.length > 0) {
  console.error(`domain imports are not allowed in surface:\n  ${bad.join('\n  ')}`);
  process.exit(1);
}
console.log('no domain imports');
