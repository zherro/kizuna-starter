import { Building2, CalendarDays, Compass, Martini } from 'lucide-react';
import { LandingLinkCards } from '@kizuna/core/client/components/landing';

// Lista enxuta de propósito (a home é client component): só título e rota. O texto completo de
// cada público mora em `@/lib/anuncie`.
const ITEMS = [
  { href: '/anuncie/pousadas', title: 'Pousadas', text: 'Mostre ao hóspede o que fazer hoje.', icon: Building2 },
  { href: '/anuncie/bares', title: 'Bares', text: 'Seu bar na lista de quem quer sair hoje.', icon: Martini },
  { href: '/anuncie/produtores-de-eventos', title: 'Produtores de eventos', text: 'Seu evento na agenda do dia.', icon: CalendarDays },
  { href: '/anuncie/guias-de-turismo', title: 'Guias de turismo', text: 'Responda o que fazer à noite.', icon: Compass },
];

/** Entrada para as páginas de captação, logo abaixo de "Seu próximo rolê começa aqui". */
export function AnuncieLinks() {
  return (
    <div className="pb-14 sm:pb-16">
      <LandingLinkCards
        id="home-anuncie"
        title="Anuncie no Bora"
        intro="Anunciar é gratuito. Escolha o seu caso e veja como entrar."
        items={ITEMS}
      />
    </div>
  );
}
