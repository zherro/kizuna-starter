import { createPaymentWebhookHandler } from '@kizuna/core/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = createPaymentWebhookHandler();
