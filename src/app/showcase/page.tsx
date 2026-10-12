// Expõe o catálogo de componentes do core (gated por SHOWCASE_ENABLED): vai para a primeira seção.
import { redirect } from 'next/navigation';
import { SHOWCASE_SECTIONS } from '@kizuna/core/client/components/showcase/showcase-sections';

export default function ShowcaseIndexPage() {
  redirect(`/showcase/${SHOWCASE_SECTIONS[0].id}`);
}
