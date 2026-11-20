'use client';

// Ilhas de texto da home que seguem o idioma escolhido pelo usuário (`useAppPreferences`, salvo no
// navegador — o servidor não sabe qual é). Ficam no cliente só elas; o resto da home é Server
// Component (ver `home-content.tsx`). Os componentes de dentro continuam recebendo `t` por prop.
import { useAppPreferences } from '@kizuna/core/client/providers/app-preferences-provider';
import { HomeHero } from './home-hero';
import { NearbyGrid } from './nearby-grid';
import { HowItWorks } from './how-it-works';
import { SocialInstallCards } from './social-install-cards';

function useHomeMessages() {
  return useAppPreferences().messages.home;
}

export function HomeHeroI18n() {
  return <HomeHero t={useHomeMessages()} />;
}

export function NearbyGridI18n() {
  return <NearbyGrid t={useHomeMessages()} />;
}

export function HowItWorksI18n() {
  return <HowItWorks t={useHomeMessages()} />;
}

export function SocialInstallCardsI18n({ instagramUrl }: { instagramUrl?: string }) {
  return <SocialInstallCards t={useHomeMessages()} instagramUrl={instagramUrl} />;
}
