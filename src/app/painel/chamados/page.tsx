import { redirect } from 'next/navigation';
import { getSession } from '@kizuna/core/server';
import { RenderScreen } from '@kizuna/core/client/components/screen-engine/render-screen';
import { CHAMADOS_SCREEN } from '@kizuna/core/client/components/screen-engine/screens/chamados';

// Plugin tickets — lista de chamados. Todo usuário logado entra; a RLS decide o que ele vê.
export default async function ChamadosPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  return (
    <RenderScreen
      config={CHAMADOS_SCREEN}
      context={{
        params: {},
        searchParams: {},
        session: { tenantId: session.tenant_id, userId: session.user_id },
      }}
    />
  );
}
