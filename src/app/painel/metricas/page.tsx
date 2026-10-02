import { redirect } from 'next/navigation';
import { getSession } from '@kizuna/core/server';
import { PainelMetricas } from '@/components/painel-metricas';

// Métricas de negócio do anunciante (plugin analytics).
export default async function MetricasPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  return <PainelMetricas tenantId={session.tenant_id} />;
}
