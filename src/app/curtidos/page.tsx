import type { Metadata } from 'next';
import { SwipeLikedPage } from '@kizuna/core/client/components/swipe/swipe-liked-page';

export const metadata: Metadata = { title: 'Curtidos', robots: { index: false } };

// Sem ProtectedRoute: no layout público a sessão hidrata depois do 1º render e o redirect
// mandava quem está logado para /login. O SwipeLikedPage espera a sessão e, se anônimo,
// oferece o login pelo modal.
export default function CurtidosPage() {
  return <SwipeLikedPage />;
}
