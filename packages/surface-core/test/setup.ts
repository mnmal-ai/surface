import { cleanup } from 'ink-testing-library';
import { afterEach } from 'vitest';

// The operator's shell must not choose the layout the tests see.
delete process.env.SURFACE_FULLSCREEN;

// Unmounts every app a test rendered, so its listeners and timers cannot slow the tests after it.
afterEach(cleanup);
