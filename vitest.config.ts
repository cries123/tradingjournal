import { defineConfig } from 'vitest/config';

/**
 * Kept separate from vite.config.ts on purpose: that config stamps every build with a git SHA via
 * execSync, which is pointless work in a test run and fails outright anywhere git is absent.
 */
export default defineConfig({
  test: {
    // Nothing here renders a component — these cover pure money math and the shape of what gets
    // written to Firestore — so the default node environment is enough and jsdom is not a dep.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
