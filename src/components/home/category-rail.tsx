'use client';

// EXEMPLO — thin wrapper sobre o <CategoryCarousel> do core. Com `items` (montados no servidor por
// `loadCategoryRailItems`), os cards já saem no HTML e nada é buscado no navegador; sem eles, o
// carrossel busca a taxonomia REAL do projeto no cliente. Os textos seguem o idioma escolhido
// (`useAppPreferences`). Trocar o visual, o link de cada card ou o ícone: passe props direto pro
// CategoryCarousel.
import { CategoryCarousel, type CategoryCarouselItem } from '@kizuna/core/client/components/taxonomy/category-carousel';
import { useAppPreferences } from '@kizuna/core/client/providers/app-preferences-provider';

export function CategoryRail({
  variant = 'classic',
  onlyWithListings = false,
  items,
}: {
  variant?: 'classic' | 'compact';
  onlyWithListings?: boolean;
  items?: CategoryCarouselItem[];
}) {
  const t = useAppPreferences().messages.home;
  return (
    <CategoryCarousel
      variant={variant}
      groupBy="group"
      onlyWithListings={onlyWithListings}
      items={items}
      hideWhenEmpty
      title={t.categoriesTitle}
      allLabel={t.categoriesAll}
      allHref="/busca"
    />
  );
}
