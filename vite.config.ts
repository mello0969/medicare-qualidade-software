import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  // The checkout is on OneDrive: wait for writes to finish before invalidating modules.
  server: { watch: { awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 50 } } },
  test: { include: ['src/**/*.test.ts'] },
});
