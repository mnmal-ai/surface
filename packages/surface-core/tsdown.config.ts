import { defineLibTsdown } from '@mnmal-ai/substrate-config/tsdown';
import type { UserConfig } from 'tsdown';

// Peers and workspace siblings stay external: one React, one Ink, one theme.
const config: UserConfig = defineLibTsdown({
  entry: { index: 'src/index.ts', pure: 'src/pure.ts' },
  external: ['ink', 'react', 'react/jsx-runtime', /^@mnmal-ai\//, 'string-width']
});

export default config;
