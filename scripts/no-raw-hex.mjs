#!/usr/bin/env node
// Theme tokens are the only colours: no raw hex outside packages/surface-theme.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Strings and comments in one pass so a comment's `#123` is skipped and a string's `#fff` is not.
const TOKENS =
  /'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`|\/\/[^\n]*|\/\*[\s\S]*?\*\//g;
// Valid CSS hex lengths only (3, 6, 8), anywhere inside a string or template literal.
const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g;
const root = process.argv[2] ?? 'packages';
const bad = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(name)) {
      const text = readFileSync(p, 'utf8');
      for (const [literal] of text.matchAll(TOKENS)) {
        if (/^(['"`])/.test(literal)) {
          for (const m of literal.matchAll(HEX)) bad.push(`${p}: ${m[0]}`);
        }
      }
    }
  }
}
for (const pkg of readdirSync(root).filter((p) => p !== 'surface-theme')) {
  walk(join(root, pkg, 'src'));
}
if (bad.length > 0) {
  console.error(`raw hex colours found; use theme tokens:\n  ${bad.join('\n  ')}`);
  process.exit(1);
}
console.log('no raw hex');
