// EXEMPLO — reescreva. Home do painel: nível da conta + hero em slides + resumo de métricas.
import { getSession, isPhoneLoginEnabled, type OtpConfig } from '@kizuna/core/server';
import { AccountLevelCard } from '@kizuna/core/client/components/account-levels';
import { PainelHero, PainelStats } from '@kizuna/core/client/components/analytics/painel-home';
import cfg from '@/../kizuna.config.json';

export default async function PainelPage() {
  const session = await getSession();

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-6 px-4 py-8 md:px-6">
      {/* Sem `initial`: o nível é buscado no browser e o card entra animado quando chega, sem
          segurar a página. Some sozinho com conta completa ou fechado há menos de 15 dias. */}
      {session ? (
        <AccountLevelCard phoneEnabled={isPhoneLoginEnabled((cfg as { otp?: OtpConfig }).otp)} />
      ) : null}

      <PainelHero />

      <PainelStats />
    </div>
  );
}
