// Expõe o catálogo de componentes do core (gated por SHOWCASE_ENABLED): uma seção por componente.
import { notFound } from 'next/navigation';
import { isShowcaseSection } from '@kizuna/core/client/components/showcase/showcase-sections';
import { ShowcaseSectionPage } from '@kizuna/core/client/components/showcase/showcase-section-page';

export const dynamic = 'force-dynamic';

export default async function ShowcaseSectionRoute({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!isShowcaseSection(section)) notFound();
  return <ShowcaseSectionPage sectionId={section} />;
}
