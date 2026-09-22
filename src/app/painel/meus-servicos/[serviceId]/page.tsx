import { redirect } from 'next/navigation';
import { getSession, isOnboardingCompletedServer } from '@kizuna/core/server';
import { ServicoWizardPage } from '@kizuna/core/client/components/services/servico-wizard-page';
import type { WizardJsonConfig } from '@kizuna/core/client/components/wizard';
import cfg from '@/../kizuna.config.json';

type EditServicePageProps = {
  params: Promise<{ serviceId: string }>;
};

export default async function EditServicoPage({ params }: EditServicePageProps) {
  const session = await getSession();
  if (!session) redirect('/login');

  const { serviceId } = await params;
  const isCreating = serviceId === 'novo';

  // O botão "Novo" é gateado, mas quem entra direto pela URL não passa por ele.
  if (isCreating && !(await isOnboardingCompletedServer())) {
    redirect('/painel/onboarding?motivo=novo-servico');
  }

  // key={serviceId}: sem ele, navegar entre dois ids reaproveita a instância do wizard e o
  // estado antigo (resourceId etc.), fazendo um "novo" dar PATCH no serviço anterior.
  return (
    <ServicoWizardPage
      key={serviceId}
      mode={isCreating ? 'create' : 'edit'}
      serviceId={isCreating ? null : serviceId}
      wizardConfig={cfg.wizards.servicos as WizardJsonConfig}
    />
  );
}
