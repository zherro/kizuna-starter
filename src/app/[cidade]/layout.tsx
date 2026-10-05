import type { ReactNode } from 'react';
import { CityInvite } from '@kizuna/core/client/components/city/city-invite';

// A validação da cidade fica em cada página (o detalhe redireciona em vez de 404).
export default function CityLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <CityInvite />
      {children}
    </>
  );
}
