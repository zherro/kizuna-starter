// Home global. Com o cookie `kz_city` apontando pra uma cidade atendida, vai pra home dela
// (`/[cidade]`). Sem cookie (1ª visita) e com `location.outsideList: "default"`, vai direto pra
// cidade padrão do kizuna.config.json — sem depender da detecção no navegador, que só grava o
// cookie e não navega (antes a 1ª visita caía na home sem cidade até um refresh). Cidade fora da
// lista / sem padrão → home global, sem loop.
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { parseLocationConfig } from '@kizuna/core/server';
import { CITY_COOKIE, cityPath } from '@kizuna/core/shared/city-routing/city-slug';
import { HomePage } from '@/components/home-page';
import { loadRoutableCities, resolveCitySlug } from '@/lib/server/cities';
import cfg from '@/../kizuna.config.json';

const locationConfig = parseLocationConfig((cfg as { location?: unknown }).location);

export default async function Home() {
  const slug = (await cookies()).get(CITY_COOKIE)?.value;
  if (slug && (await resolveCitySlug(slug))) redirect(`/${slug}`);

  if (!slug && locationConfig.outsideList === 'default' && locationConfig.defaultCityIbge) {
    const cities = await loadRoutableCities().catch(() => []);
    const fallback = cities.find((c) => c.ibge === locationConfig.defaultCityIbge);
    if (fallback) redirect(cityPath(fallback));
  }

  return <HomePage city={null} />;
}
