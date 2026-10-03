import { readFile, rm } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import type { Reporter } from '@playwright/test/reporter';

export default class CleanupReporter implements Reporter {
  async onExit() {
    const directory = resolve(process.env.MEDICARE_E2E_DIRECTORY ?? '');
    const runId = process.env.MEDICARE_E2E_RUN_ID;
    // onExit runs after the webServer plugins stop; delete only this run's verified temp directory.
    if (
      dirname(directory) !== resolve(tmpdir()) ||
      !basename(directory).startsWith('medicare-e2e-') ||
      !runId
    )
      return;
    let owner: string;
    try {
      owner = await readFile(join(directory, 'qa-run-id'), 'utf8');
    } catch {
      return;
    }
    if (owner !== runId) return;
    try {
      await fetch('http://127.0.0.1:3002/api/health', { signal: AbortSignal.timeout(500) });
      console.warn('O servidor de QA ainda está ativo; o diretório temporário foi preservado.');
      return;
    } catch {
      /* The test server has stopped, so SQLite files can be removed safely. */
    }
    await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  }
}
