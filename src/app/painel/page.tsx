// EXEMPLO — reescreva. Home do painel: vitrine de engajamento (boas-vindas, descoberta, favoritos,
// atalhos e convite a anunciar) no topo; depois, em segundo plano, nível da conta, destaques e
// métricas de quem anuncia. O `PainelWelcome` é dono do único <h1>; o PainelHero desce para <h2>.
import { getSession, isPhoneLoginEnabled, type OtpConfig } from '@kizuna/core/server';
import { AccountLevelCard } from '@kizuna/core/client/components/account-levels';
import { PainelHero, PainelStats } from '@kizuna/core/client/components/analytics/painel-home';
import { PainelWelcome } from '@kizuna/core/client/components/painel-welcome';
import { vocabulary } from '@/lib/vocabulary';
import cfg from '@/../kizuna.config.json';

export default async function PainelPage() {
  const session = await getSession();

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-10 px-4 py-8 md:px-6">
      <PainelWelcome
        name={session?.display_name}
        advertise={{ href: '/painel/meus-servicos/novo', label: vocabulary.phrases.new }}
      />

      <section aria-labelledby="painel-conta-titulo" className="flex flex-col gap-6">
        <div>
          <h2 id="painel-conta-titulo" className="text-sm font-semibold text-foreground">
            Sua conta e seus anúncios
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Nível da conta, destaques e números dos seus anúncios.
          </p>
        </div>

        {/* Sem `initial`: o nível é buscado no browser e o card entra animado quando chega, sem
            segurar a página. Some sozinho com conta completa ou fechado há menos de 15 dias. */}
        {session ? (
          <AccountLevelCard phoneEnabled={isPhoneLoginEnabled((cfg as { otp?: OtpConfig }).otp)} />
        ) : null}

        <PainelHero headingAs="h2" />

        <PainelStats />
      </section>
    </div>
  );
}
