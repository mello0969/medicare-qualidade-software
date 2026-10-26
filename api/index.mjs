import { createHandler } from '../server/app.mjs';

// One shared pool per warm Function; persistence lives in Postgres, never in /tmp.
const handler = createHandler();
export const config = { api: { bodyParser: false } };
export default handler;
