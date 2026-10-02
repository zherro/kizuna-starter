import { canDo } from '@kizuna/core/shared/account-levels';
import { getAccountStatus, isPhoneLoginEnabled, type OtpConfig } from '@kizuna/core/server';
import { AccountLevelsPanel } from '@kizuna/core/client/components/account-levels';
import { accountLevelsSetup } from '@/lib/server/account-levels';
import cfg from '@/../kizuna.config.json';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ acao?: string }> };

/** Escada de níveis da conta ("evolua sua conta"). `?acao=` destaca o nível que a ação exige. */
export default async function OnboardingPage({ searchParams }: Props) {
  const { acao } = await searchParams;
  const status = await getAccountStatus(accountLevelsSetup);
  const allowed = Object.fromEntries(
    Object.keys(accountLevelsSetup.capabilities).map((a) => [
      a,
      canDo(status, accountLevelsSetup.capabilities, a).allowed,
    ])
  );
  const blocked = acao ? canDo(status, accountLevelsSetup.capabilities, acao) : null;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 p-4 md:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Evolua sua conta</h1>
        <p className="text-sm text-muted-foreground">
          Cada nivel libera mais coisas. Voce so precisa completar quando quiser usar.
        </p>
      </header>

      {blocked && !blocked.allowed && blocked.required ? (
        <p className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm">
          Para <strong>{(accountLevelsSetup.labels?.[acao!] ?? 'continuar').toLowerCase()}</strong>,
          chegue ao nivel <strong>{blocked.required.title}</strong>.
        </p>
      ) : null}

      <AccountLevelsPanel
        initial={{ status, allowed }}
        highlightLevelKey={blocked && !blocked.allowed ? (blocked.required?.key ?? null) : null}
        phoneEnabled={isPhoneLoginEnabled((cfg as { otp?: OtpConfig }).otp)}
      />
    </div>
  );
}
