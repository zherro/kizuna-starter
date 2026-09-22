// EXEMPLO — home pública. A cara é parametrizada por env (lidas aqui, no
// servidor, e passadas como props — `process.env` não chega em Client Component):
//   KIZUNA_HOME_HERO=true|false            → mostra/esconde o hero
//   KIZUNA_HOME_CATEGORIES=classic|compact → layout do carrossel de categorias
//   KIZUNA_HOME_DISCOVER=true|false        → banner "Descobrir no swipe"
import { HomeContent } from '@/components/home-content';

export default function Home() {
  return (
    <HomeContent
      showHero={process.env.KIZUNA_HOME_HERO !== 'false'}
      categoriesVariant={process.env.KIZUNA_HOME_CATEGORIES === 'compact' ? 'compact' : 'classic'}
      showDiscover={process.env.KIZUNA_HOME_DISCOVER === 'true'}
    />
  );
}
