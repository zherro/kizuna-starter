import { redirect } from 'next/navigation';
import { getSession } from '@kizuna/core/server';
import { RenderScreen } from '@kizuna/core/client/components/screen-engine/render-screen';
import { MINHA_CONTA_SCREEN } from '@kizuna/core/client/components/screen-engine/screens/minha-conta';
import type { ScreenConfig } from '@kizuna/core/types/screen';

// Minha conta do Bora: a mesma tela do core, mas salvar não exige estado/cidade — quem só quer
// trocar o nome ou a foto consegue. O endereço continua exigido para o perfil ficar completo
// (passo do onboarding e nível de conta). Rota fixa: tem prioridade sobre o catch-all
// `/painel/[...kizuna]`, que segue servindo a tela padrão para quem não sobrescreve.
const SCREEN: ScreenConfig = {
  ...MINHA_CONTA_SCREEN,
  blocks: MINHA_CONTA_SCREEN.blocks.map((block) =>
    block.component === 'account-form'
      ? { ...block, props: { ...block.props, addressOptionalOnSave: true } }
      : block
  ),
};

export default async function MinhaContaPage() {
  const session = await getSession();
  if (!session) redirect('/login?returnTo=/painel/minha-conta');

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
