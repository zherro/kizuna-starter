import { redirect } from 'next/navigation';
import { getSession } from '@kizuna/core/server';
import { canAccessAiReview } from '@kizuna/core/server/ai';
import { AiReviewScreen } from '@kizuna/core/client/components/ai-review';
import { PageContainerWrapper } from '@kizuna/core/client/components/wrappers/page-container-wrapper';
import { PageHeaderWrapper } from '@kizuna/core/client/components/wrappers/page-header-wrapper';

// Revisão de textos por IA: somente root (as rotas /api/ai/* repetem o gate).
export default async function RevisaoIaPage() {
  const session = await getSession();
  if (!canAccessAiReview(session)) redirect('/painel');

  return (
    <PageContainerWrapper maxWidth="wide">
      <PageHeaderWrapper
        badge="Administração"
        title="Revisão de textos por IA"
        description="Gere sugestões de descrição por categoria e aprove, edite ou rejeite uma a uma."
      />
      <AiReviewScreen />
    </PageContainerWrapper>
  );
}
