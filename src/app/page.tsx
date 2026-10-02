// Home global. Com o cookie `kz_city` apontando pra uma cidade atendida, vai pra home dela
// (`/[cidade]`); sem cookie (ou cidade que saiu da lista) mostra a home global — sem loop.
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { CITY_COOKIE } from '@kizuna/core/shared/city-routing/city-slug';
import { HomePage } from '@/components/home-page';
import { resolveCitySlug } from '@/lib/server/cities';

export default async function Home() {
  const slug = (await cookies()).get(CITY_COOKIE)?.value;
  if (slug && (await resolveCitySlug(slug))) redirect(`/${slug}`);
  return <HomePage city={null} />;
}
