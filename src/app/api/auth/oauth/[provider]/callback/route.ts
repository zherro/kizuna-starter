import { createOAuthCallbackHandler, pgrstRpc, pgrstTable } from '@kizuna/core/server';

export const runtime = 'nodejs';

export const GET = createOAuthCallbackHandler(pgrstRpc, { pgrstTable });
