import { createOAuthStartHandler } from '@kizuna/core/server';

export const runtime = 'nodejs';

export const GET = createOAuthStartHandler();
