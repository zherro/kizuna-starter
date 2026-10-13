// Blocos de engajamento da home (Server Components): "Lugares da cidade" e "Notícias". Só compõem
// os blocos do core com os loaders do starter; cada um some sozinho quando não há conteúdo.
import { PlaceHighlights } from '@kizuna/core/client/components/home/place-highlights';
import { NewsHighlights } from '@kizuna/core/client/components/home/news-highlights';
import { citySlug, type RoutableCity } from '@kizuna/core/shared/city-routing/city-slug';
import { loadHomePlaces } from '@/lib/lugares';
import { homeNewsMoreHref, loadHomeNews } from '@/lib/noticias';

export function HomePlaces({ city, limit = 6 }: { city: RoutableCity | null; limit?: number }) {
  const items = loadHomePlaces({
    citySlug: city ? citySlug(city.name, city.state) : undefined,
    cityName: city?.name,
    limit,
  });
  return <PlaceHighlights items={items} />;
}

export async function HomeNews({ city, limit = 6 }: { city: RoutableCity | null; limit?: number }) {
  // Falha de rede/RPC não pode derrubar a home inteira: o bloco apenas some.
  const items = await loadHomeNews({ cityIbge: city?.ibge, limit }).catch(() => []);
  return <NewsHighlights items={items} moreHref={homeNewsMoreHref(city)} />;
}
