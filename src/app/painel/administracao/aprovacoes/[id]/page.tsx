import { redirect } from 'next/navigation';
import { getSession } from '@kizuna/core/server';
import { ServicoWizardPage } from '@kizuna/core/client/components/services/servico-wizard-page';
import type { WizardJsonConfig } from '@kizuna/core/client/components/wizard';
import cfg from '@/../kizuna.config.json';

type ReviewServicePageProps = {
  params: Promise<{ id: string }>;
};

// Revisão = o mesmo wizard em `mode="review"` (acrescenta o passo Status). Root-only.
export default async function ReviewServicePage({ params }: ReviewServicePageProps) {
  const session = await getSession();
  if (!session?.is_root) redirect('/painel');

  const { id } = await params;

  // key={id}: mesmo motivo da página de edição — evita estado velho entre revisões.
  return (
    <ServicoWizardPage
      key={id}
      mode="review"
      serviceId={id}
      wizardConfig={cfg.wizards.servicos as WizardJsonConfig}
    />
  );
}
