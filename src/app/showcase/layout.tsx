// Expõe o catálogo de componentes do core; só responde quando SHOWCASE_ENABLED permite.
import { notFound } from 'next/navigation';
import { isShowcaseEnabled } from '@kizuna/core/lib/utils';
import { ShowcaseShell } from '@kizuna/core/client/components/showcase/showcase-shell';

// A flag é lida em runtime: sem isto o layout seria pré-renderizado no build com o valor da época.
export const dynamic = 'force-dynamic';

export const metadata = { robots: { index: false, follow: false }, title: 'Showcase' };

export default function ShowcaseLayout({ children }: { children: React.ReactNode }) {
  if (!isShowcaseEnabled()) notFound();
  return <ShowcaseShell>{children}</ShowcaseShell>;
}
