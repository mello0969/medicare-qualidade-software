import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const apiTarget = process.env.MEDICARE_API_URL ?? 'http://127.0.0.1:3001';

export default defineConfig({
  plugins: [react()],
  base: './',
  // The checkout is on OneDrive: wait for writes to finish before invalidating modules.
  server: {
    watch: { awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 50 } },
    proxy: { '/api': { target: apiTarget } },
  },
  preview: { proxy: { '/api': { target: apiTarget } } },
  test: { include: ['src/**/*.test.ts'] },
});
