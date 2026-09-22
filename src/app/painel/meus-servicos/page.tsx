import { redirect } from 'next/navigation';
import { getSession } from '@kizuna/core/server';
import { RenderScreen } from '@kizuna/core/client/components/screen-engine/render-screen';
import { MEUS_SERVICOS_SCREEN } from '@kizuna/core/client/components/screen-engine/screens/meus-servicos';

// Listagem própria de cada usuário logado (não `createScreenPage`: o gate dele é ADMIN).
// `session.tenantId` resolve o `fixedFilters` "$session.tenantId"; `userId` resolve o
// `createGateUserId` que barra "Novo" até o onboarding ser concluído.
export default async function MeusServicosPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  return (
    <RenderScreen
      config={MEUS_SERVICOS_SCREEN}
      context={{
        params: {},
        searchParams: {},
        session: { tenantId: session.tenant_id, userId: session.user_id },
      }}
    />
  );
}
