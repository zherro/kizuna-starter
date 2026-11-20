// Server Component: busca os cards do carrossel de categorias no servidor e entrega ao
// `CategoryRail` (client só pela rolagem/setas e pelo idioma do título). Async e isolado para não
// segurar o resto da home enquanto a taxonomia carrega (as trilhas buscam em paralelo).
import { CategoryRail } from './category-rail';
import { loadCategoryRailItems } from './category-rail-items';

export async function HomeCategoryRail({
  variant,
  onlyWithListings,
}: {
  variant: 'classic' | 'compact';
  onlyWithListings: boolean;
}) {
  const items = await loadCategoryRailItems({ groupBy: 'group', onlyWithListings });
  return <CategoryRail variant={variant} onlyWithListings={onlyWithListings} items={items} />;
}
