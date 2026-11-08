import { AnuncieIndex, anuncieMetadata } from '@/components/anuncie/anuncie-parts';

export const metadata = anuncieMetadata({
  title: 'Anuncie no Bora Cuiabá: pousadas, bares, eventos e passeios',
  description:
    'Divulgue sua pousada, bar, evento ou passeio no Bora Cuiabá, que reúne eventos, cinema e lugares de Cuiabá, Várzea Grande e Chapada dos Guimarães. Anunciar é gratuito.',
  path: '/anuncie',
});

export default function AnuncieIndexPage() {
  return <AnuncieIndex />;
}
