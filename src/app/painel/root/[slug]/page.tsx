import { resolveRootScreen } from '@kizuna/core/client/components/root-screens/resolver';
import { SystemConfigScreen } from '@kizuna/core/client/components/administracao/system-config-screen';

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
 * (`/painel/root/configuracoes`).
 */
export default async function RootAdminScreenPage({ params }: Readonly<PageProps>) {
  const { slug } = await params;
  const { Component } = await resolveRootScreen('root', slug, {
    slotComponents: { configuracoes: SystemConfigScreen },
  });

  return <Component />;
}
