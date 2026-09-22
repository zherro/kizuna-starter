import { createLoginHandler, pgrstRpc } from '@kizuna/core/server';

export const runtime = 'nodejs';

export const POST = createLoginHandler(pgrstRpc);
