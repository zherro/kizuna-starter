import { createRegisterHandler, pgrstRpc } from '@kizuna/core/server';

export const runtime = 'nodejs';

export const POST = createRegisterHandler(pgrstRpc);
