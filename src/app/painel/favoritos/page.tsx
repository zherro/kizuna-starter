import { SwipeLikedPage } from '@kizuna/core/client/components/swipe/swipe-liked-page';

// Mesma lista do /curtidos, dentro do painel (menu Favoritos, permissão favorites/view), com o
// cabeçalho de Meus serviços, remoção confirmada e os expirados separados no fim.
export default function FavoritosPage() {
  return <SwipeLikedPage variant="panel" />;
}
