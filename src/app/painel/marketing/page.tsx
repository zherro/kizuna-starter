import { redirect } from 'next/navigation';
import { getSession } from '@kizuna/core/server';
import { AdvertiserPanel } from '@kizuna/core/client/components/marketing/advertiser/advertiser-panel';

export const dynamic = 'force-dynamic';

// Painel do anunciante: saldo, impulsionamentos, banners e métricas (plugin marketing).
// Qualquer usuário logado com conta; o que cada um vê e cria é decidido pela RLS por conta.
export default async function MarketingPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  return <AdvertiserPanel tenantId={session.tenant_id} />;
}
