import { createPaymentWebhookHandler } from '@kizuna/core/server';
import { revalidateBoostSurfaces } from '@/lib/server/revalidate-ad-pages';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const handler = createPaymentWebhookHandler();

/**
 * Pagamento confirmado pode ter criado um impulsionamento (compra direta): limpa o cache das
 * trilhas, busca e Hoje para ele aparecer na hora. Webhook de pagamento é raro, então não pesa.
 */
export async function POST(request: Request, ctx: { params: Promise<{ provider: string }> }) {
  const res = await handler(request, ctx);
  if (res.ok) revalidateBoostSurfaces();
  return res;
}
