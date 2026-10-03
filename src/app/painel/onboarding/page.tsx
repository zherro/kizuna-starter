import { getAccountLevelView, isPhoneLoginEnabled, type OtpConfig } from '@kizuna/core/server';
import { AccountLevelsOnboarding } from '@kizuna/core/client/components/account-levels';
import { accountLevelsSetup } from '@/lib/server/account-levels';
import cfg from '@/../kizuna.config.json';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ acao?: string }> };

/**
 * Escada de níveis da conta ("evolua sua conta"). `?acao=` destaca o nível que a ação exige.
 * Mesma tela que o `RequireLevel` mostra numa página barrada (ex.: /painel/meus-servicos/novo).
 */
export default async function OnboardingPage({ searchParams }: Props) {
  const { acao } = await searchParams;
  const view = await getAccountLevelView(accountLevelsSetup, acao);

  return (
    <AccountLevelsOnboarding
      initial={{ status: view.status, allowed: view.allowed }}
      blocked={view.blocked}
      actionLabel={view.actionLabel}
      phoneEnabled={isPhoneLoginEnabled((cfg as { otp?: OtpConfig }).otp)}
    />
  );
}
