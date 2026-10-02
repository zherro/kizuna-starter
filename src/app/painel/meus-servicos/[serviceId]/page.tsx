import { redirect } from 'next/navigation';
import { RequireLevel, getSession, isPhoneLoginEnabled, type OtpConfig } from '@kizuna/core/server';
import { ServicoWizardPage } from '@kizuna/core/client/components/services/servico-wizard-page';
import type { WizardJsonConfig } from '@kizuna/core/client/components/wizard';
import cfg from '@/../kizuna.config.json';
import { accountLevelsSetup } from '@/lib/server/account-levels';

type EditServicePageProps = {
  params: Promise<{ serviceId: string }>;
};

export default async function EditServicoPage({ params }: EditServicePageProps) {
  const { serviceId } = await params;

  const session = await getSession();
  if (!session) redirect(`/login?returnTo=${encodeURIComponent(`/painel/meus-servicos/${serviceId}`)}`);

  const isCreating = serviceId === 'novo';

  // key={serviceId}: sem ele, navegar entre dois ids reaproveita a instância do wizard e o
  // estado antigo (resourceId etc.), fazendo um "novo" dar PATCH no serviço anterior.
  const wizard = (
    <ServicoWizardPage
      key={serviceId}
      mode={isCreating ? 'create' : 'edit'}
      serviceId={isCreating ? null : serviceId}
      wizardConfig={cfg.wizards.servicos as WizardJsonConfig}
    />
  );

  if (!isCreating) return wizard;

  // Barreira real (quem entra direto pela URL): nível exigido por 'service.create'.
  return (
    <RequireLevel
      setup={accountLevelsSetup}
      action="service.create"
      returnTo="/painel/meus-servicos/novo"
      phoneEnabled={isPhoneLoginEnabled((cfg as { otp?: OtpConfig }).otp)}
    >
      {wizard}
    </RequireLevel>
  );
}
