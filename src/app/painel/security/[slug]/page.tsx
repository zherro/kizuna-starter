import { resolveRootScreen } from '@kizuna/core/client/components/root-screens/resolver';

type PageProps = {
  params: Promise<{ slug: string }>;
};

/**
 * Catch-all route for every ROOT-only auth/security screen — thin by design, see
 * `kizuna-core/src/client/components/root-screens/registry.ts` and `resolver.tsx` for the gate +
 * registry lookup.
 *
 * Slugs live today: `root-access-log` (`/painel/security/root-access-log`).
 */
export default async function SecurityScreenPage({ params }: Readonly<PageProps>) {
  const { slug } = await params;
  const { Component } = await resolveRootScreen('security', slug);

  return <Component />;
}
