import { notFound, permanentRedirect } from 'next/navigation';
import type { Metadata } from 'next';
import { cityPath, citySlug } from '@kizuna/core/shared/city-routing/city-slug';
import { AnuncioDetail, anuncioMetadata, loadAd } from '@/lib/anuncio-detail';
import { CityRouteMarker } from '@kizuna/core/client/components/city/city-route-marker';

type Props = { params: Promise<{ cidade: string; uid: string }> };

export const revalidate = 300;
export const dynamicParams = true;

export function generateStaticParams(): { cidade: string; uid: string }[] {
  return [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { uid } = await params;
  const data = await loadAd(uid);
  if (!data) return { title: 'Anúncio não encontrado' };
  const path = data.city
    ? cityPath(data.city, `/anuncio/${data.service.uid}`)
    : `/anuncios/${data.service.uid}`;
  return anuncioMetadata(data, path);
}

/**
 * Link fixo do anúncio: a cidade da URL é SEMPRE a cidade real dele. URL com cidade errada
 * redireciona pra cidade certa; anúncio sem cidade resolvível volta pro legado (que o renderiza).
 */
export default async function CityAnuncioPage({ params }: Props) {
  const { cidade, uid } = await params;
  const data = await loadAd(uid);
  if (!data) notFound();

  if (!data.city) permanentRedirect(`/anuncios/${data.service.uid}`);
  if (citySlug(data.city.name, data.city.state) !== cidade) {
    permanentRedirect(cityPath(data.city, `/anuncio/${data.service.uid}`));
  }

  return (
    <>
      <CityRouteMarker city={data.city} />
      <AnuncioDetail data={data} path={cityPath(data.city, `/anuncio/${data.service.uid}`)} />
    </>
  );
}
