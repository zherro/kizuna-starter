import { notFound, redirect } from 'next/navigation';
import { getSession } from '@kizuna/core/server';
import { PainelMetricas } from '@kizuna/core/client/components/analytics/painel-metricas';

// Métricas de negócio do anunciante (plugin analytics). Só com `analytics/view` (root sempre tem).
export default async function MetricasPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!session.is_root && !session.perms?.analytics?.view) notFound();
  return <PainelMetricas tenantId={session.tenant_id} />;
}
