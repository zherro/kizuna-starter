import { resolveRootScreen } from '@kizuna/core/client/components/root-screens/resolver';
import { AiAdminScreen } from '@kizuna/core/client/components/ai-review';
import { SystemConfigScreen } from '@kizuna/core/client/components/administracao/system-config-screen';
import { panelMenuForRoles } from '@/components/panel-nav';

type PageProps = {
  params: Promise<{ slug: string }>;
};

/**
 * Catch-all route for every ROOT-only "administração geral do sistema" screen — thin by design,
 * see `kizuna-core/src/client/components/root-screens/registry.ts` and `resolver.tsx` for the
 * gate + registry lookup. `configuracoes` is a slot slug (registry entry with `component: null`);
 * this project supplies its own component for it here since it owns the config keys edited on
 * that screen.
 *
 * Slugs live today: `plugins` (`/painel/root/plugins`), `configuracoes`
 * (`/painel/root/configuracoes`), `ia` (`/painel/root/ia`).
 */
export default async function RootAdminScreenPage({ params }: Readonly<PageProps>) {
  const { slug } = await params;
  const { Component } = await resolveRootScreen('root', slug, {
    slotComponents: { configuracoes: SystemConfigScreen, ia: AiAdminScreen },
  });

  // Papéis e permissões: mostra cada permissão com os nomes do menu do painel (mesma lista da barra lateral).
  if (slug === 'papeis') return <Component menu={panelMenuForRoles()} />;

  return <Component />;
}
