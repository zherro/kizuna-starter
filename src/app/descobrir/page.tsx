import type { Metadata } from 'next';
import { SwipePage } from '@kizuna/core/client/components/swipe/swipe-page';

export const metadata: Metadata = {
  title: 'Descobrir',
  description: 'Deslize para curtir ou passar e encontre o que combina com você.',
  alternates: { canonical: '/descobrir' },
};

export default function DescobrirPage() {
  return <SwipePage />;
}
