import { createServer } from './app.mjs';

const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT inválida.');
const server = createServer();
server.listen(port, host, () => console.log(`API MediCare disponível em http://${host}:${port}`));
server.on('error', (error) => {
  console.error('Não foi possível iniciar a API:', error.code ?? error.name);
  server.closeDatabase();
  process.exitCode = 1;
});
function shutdown() {
  server.close(() => {
    server.closeDatabase();
  });
  server.closeIdleConnections();
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
