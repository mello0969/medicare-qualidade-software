import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const backend = spawn(process.execPath, ['--env-file-if-exists=.env', 'server/index.mjs'], {
  stdio: 'inherit',
  windowsHide: true,
});
const vite = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
const frontend = spawn(
  process.execPath,
  ['--env-file-if-exists=.env', vite, '--host', '127.0.0.1', ...process.argv.slice(2)],
  {
    stdio: 'inherit',
    windowsHide: true,
  },
);
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  backend.kill();
  frontend.kill();
  process.exitCode = code;
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
for (const child of [backend, frontend]) {
  child.on('error', (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on('exit', (code) => stop(code ?? 1));
}
