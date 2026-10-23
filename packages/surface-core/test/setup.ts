import { cleanup } from 'ink-testing-library';
import { afterEach } from 'vitest';

// Unmounts every app a test rendered, so its listeners and timers cannot slow the tests after it.
afterEach(cleanup);
