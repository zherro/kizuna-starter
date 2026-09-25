import type { Metadata } from 'next';
import { ProtectedRoute } from '@kizuna/core/client/components/protected-route';
import { SwipeLikedPage } from '@kizuna/core/client/components/swipe/swipe-liked-page';

export const metadata: Metadata = { title: 'Curtidos', robots: { index: false } };

export default function CurtidosPage() {
  return (
    <ProtectedRoute>
      <SwipeLikedPage />
    </ProtectedRoute>
  );
}
