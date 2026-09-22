import { redirect } from 'next/navigation';
import { getSession } from '@kizuna/core/server';
import { RenderScreen } from '@kizuna/core/client/components/screen-engine/render-screen';
import { APROVACOES_SCREEN } from '@kizuna/core/client/components/screen-engine/screens/aprovacoes';

// Aprovar/reprovar serviço é ação de ROOT (não uma permissão concedível ao tenant).
export default async function AprovacoesScreenPage() {
  const session = await getSession();
  if (!session?.is_root) redirect('/painel');

  return <RenderScreen config={APROVACOES_SCREEN} />;
}
