import { notFound, permanentRedirect } from 'next/navigation';
import type { Metadata } from 'next';
import { cityPath } from '@kizuna/core/shared/city-routing/city-slug';
import { AnuncioDetail, anuncioMetadata, loadAd } from '@/lib/anuncio-detail';

type Props = { params: Promise<{ uid: string }> };

export const revalidate = 300;
export const dynamicParams = true;

export function generateStaticParams(): { uid: string }[] {
  return [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { uid } = await params;
  const data = await loadAd(uid);
  if (!data) return { title: 'Anúncio não encontrado' };
  return anuncioMetadata(data, `/anuncios/${data.service.uid}`);
}

/**
 * Rota legada. Anúncio com cidade resolvível redireciona (permanente) pro link canônico
 * `/[cidade]/anuncio/[uid]`; sem cidade resolvível continua sendo renderizado aqui.
 */
export default async function AnuncioPage({ params }: Props) {
  const { uid } = await params;
  const data = await loadAd(uid);
  if (!data) notFound();

  if (data.city) permanentRedirect(cityPath(data.city, `/anuncio/${data.service.uid}`));

  return <AnuncioDetail data={data} path={`/anuncios/${data.service.uid}`} />;
}
