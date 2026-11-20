import { createCheckoutHandler, createCheckoutInfoHandler } from '@kizuna/core/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = createCheckoutInfoHandler();
export const POST = createCheckoutHandler();
