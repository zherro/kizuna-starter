import type { Metadata } from 'next';
import { buildMetadata } from '@kizuna/core/server';
import { PlacesExplorer } from '@kizuna/core/client/components/map';
import { MAP_CENTER, MAP_GROUP_STYLES, MAP_ZOOM } from '@/lib/mapa';
import { SEO_SITE } from '@/lib/seo';

export const revalidate = 300;

export const metadata: Metadata = buildMetadata(SEO_SITE, {
  title: 'Mapa de Cuiabá: eventos, bares, cinema e lugares perto de você',
  description:
    'Veja no mapa o que tem perto de você em Cuiabá e região: shows, eventos, cinema, bares e lugares. Toque no pino, calcule a rota e confira os detalhes.',
  path: '/mapa',
  image: null,
});

/** Casco da tela: só o header do layout (o rodapé some em /mapa); o cliente busca os pinos pelo raio visível. */
export default function MapaPage() {
  return (
    <>
      <h1 className="sr-only">Mapa de eventos e lugares em Cuiabá e região</h1>
      <PlacesExplorer center={MAP_CENTER} zoom={MAP_ZOOM} groupStyles={MAP_GROUP_STYLES} />
    </>
  );
}
