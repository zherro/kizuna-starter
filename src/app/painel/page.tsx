// EXEMPLO — reescreva. Home do painel: vitrine de engajamento (boas-vindas, descoberta, favoritos,
// atalhos e convite a anunciar) no topo; depois, em segundo plano, nível da conta e — só com a
// permissão `analytics/view` (root sempre tem) — as métricas. O `PainelWelcome` é dono do único <h1>.
// O slide de destaques (PainelHero) saiu daqui; está no showcase (/showcase/painel-hero).
import { getSession, isPhoneLoginEnabled, type OtpConfig } from '@kizuna/core/server';
import { AccountLevelCard } from '@kizuna/core/client/components/account-levels';
import { PainelStats } from '@kizuna/core/client/components/analytics/painel-home';
import { ShortcutGrid } from '@kizuna/core/client/components/shortcut-grid';
import { OpenTicketsBadge } from '@kizuna/core/client/components/tickets/open-tickets-badge';
import { LifeBuoy } from 'lucide-react';
import { PainelWelcome } from '@kizuna/core/client/components/painel-welcome';
import { vocabulary } from '@/lib/vocabulary';
import cfg from '@/../kizuna.config.json';

export default async function PainelPage() {
  const session = await getSession();
  const canSeeMetrics = Boolean(session?.is_root || session?.perms?.analytics?.view);

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-10 px-4 py-8 md:px-6">
      {session?.is_root ? (
        <ShortcutGrid
          label="Atalhos do root"
          items={[{ href: '/painel/chamados', title: 'Chamados', text: 'Pedidos de ajuda e contatos', Icon: LifeBuoy, badge: <OpenTicketsBadge /> }]}
        />
      ) : null}

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
            {canSeeMetrics ? 'Nível da conta e números dos seus anúncios.' : 'Nível da conta.'}
          </p>
        </div>

        {/* Sem `initial`: o nível é buscado no browser e o card entra animado quando chega, sem
            segurar a página. Some sozinho com conta completa ou fechado há menos de 15 dias. */}
        {session ? (
          <AccountLevelCard phoneEnabled={isPhoneLoginEnabled((cfg as { otp?: OtpConfig }).otp)} />
        ) : null}

        {canSeeMetrics ? <PainelStats /> : null}
      </section>
    </div>
  );
}
