import type { Metadata } from 'next';
import { NOINDEX_FOLLOW } from '@/lib/seo-index';
import { SwipePage } from '@kizuna/core/client/components/swipe/swipe-page';

export const metadata: Metadata = {
  title: 'Descobrir',
  description: 'Deslize para curtir ou passar e encontre o que combina com você.',
  alternates: { canonical: '/descobrir' },
  // Swipe 100% no cliente, sem conteúdo no HTML: fora do índice e do sitemap (links seguidos).
  robots: NOINDEX_FOLLOW,
};

export default function DescobrirPage() {
  return <SwipePage />;
}
