import { redirect } from 'next/navigation';
import { getSession } from '@kizuna/core/server';
import { AdvertiserPanel } from '@kizuna/core/client/components/marketing/advertiser/advertiser-panel';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ aba?: string | string[]; anuncio?: string | string[] }> };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

// Painel do anunciante: saldo, impulsionamentos, banners e métricas (plugin marketing).
// Qualquer usuário logado com conta; o que cada um vê e cria é decidido pela RLS por conta.
// `?aba=impulsionar&anuncio=<uid>` vem do botão "Impulsionar" em Minhas publicações.
export default async function MarketingPage({ searchParams }: Props) {
  const session = await getSession();
  if (!session) redirect('/login');
  const sp = await searchParams;
  const anuncio = one(sp.anuncio);
  return (
    <AdvertiserPanel
      tenantId={session.tenant_id}
      initialTab={one(sp.aba)}
      initialServiceUid={anuncio && /^[0-9a-f-]{36}$/i.test(anuncio) ? anuncio : undefined}
    />
  );
}
