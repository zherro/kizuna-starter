// EXEMPLO — home pública. A cara é parametrizada por `kizuna.config.json`
// (chave "home"), não por env — evita rebuild de Docker com --build-arg
// para cada toggle novo.
import { HomeContent } from '@/components/home-content';
import cfg from '@/../kizuna.config.json';
import { HOME_INK_LEVELS, type HomeInkLevel } from '@/components/home/home-ink-config';

const home = cfg.home as typeof cfg.home & { inkPicker?: boolean; inkLevel?: number };
const inkLevel = HOME_INK_LEVELS.includes(home?.inkLevel as HomeInkLevel)
  ? (home.inkLevel as HomeInkLevel)
  : undefined;

export default function Home() {
  return (
    <HomeContent
      showHero={cfg.home?.showHero !== false}
      categoriesVariant={cfg.home?.categoriesVariant === 'compact' ? 'compact' : 'classic'}
      showDiscover={cfg.home?.showDiscover === true}
      inkPicker={home?.inkPicker !== false}
      inkLevel={inkLevel}
    />
  );
}
