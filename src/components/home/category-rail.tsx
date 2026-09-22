'use client';

// EXEMPLO — thin wrapper sobre o <CategoryCarousel> do core, que busca a
// taxonomia REAL do projeto (só categorias com subcategoria ativa). Trocar o
// visual, o link de cada card ou o ícone: passe props direto pro CategoryCarousel.
import { CategoryCarousel } from '@kizuna/core/client/components/taxonomy/category-carousel';
import type { AppMessages } from '@/i18n/messages';

type HomeMessages = AppMessages['home'];

export function CategoryRail({
  t,
  variant = 'classic',
}: {
  t: HomeMessages;
  variant?: 'classic' | 'compact';
}) {
  return (
    <CategoryCarousel
      variant={variant}
      title={t.categoriesTitle}
      allLabel={t.categoriesAll}
      allHref="/busca"
    />
  );
}
