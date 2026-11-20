import { redirect } from 'next/navigation';
import { getSession } from '@kizuna/core/server';
import { RenderScreen } from '@kizuna/core/client/components/screen-engine/render-screen';
import { MEUS_SERVICOS_SCREEN } from '@kizuna/core/client/components/screen-engine/screens/meus-servicos';
import type { ScreenConfig } from '@kizuna/core/client/components/screen-engine/types';

// "Impulsionar" por anúncio publicado → painel de marketing com o anúncio já escolhido (PIX).
// Fica no projeto (o core é compartilhado e nem todo projeto tem o plugin marketing).
const SCREEN: ScreenConfig = {
  ...MEUS_SERVICOS_SCREEN,
  blocks: MEUS_SERVICOS_SCREEN.blocks.map((b) =>
    b.component === 'list'
      ? {
          ...b,
          props: {
            ...b.props,
            config: {
              ...(b.props as { config: object }).config,
              secondaryAction: {
                label: 'Impulsionar',
                href: '/painel/marketing?aba=impulsionar&anuncio={uid}',
                showWhen: { status: 'active', active: true },
              },
            },
          },
        }
      : b,
  ),
};

// Listagem própria de cada usuário logado (não `createScreenPage`: o gate dele é ADMIN).
// `session.tenantId` resolve o `fixedFilters` "$session.tenantId"; `userId` resolve o
// `createGateUserId` que barra "Novo" até o onboarding ser concluído.
export default async function MeusServicosPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  return (
    <RenderScreen
      config={SCREEN}
      context={{
        params: {},
        searchParams: {},
        session: { tenantId: session.tenant_id, userId: session.user_id },
      }}
    />
  );
}
