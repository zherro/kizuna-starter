import type { ReactNode } from 'react';
import { CityInvite } from '@/components/city-invite';

// A validação da cidade fica em cada página (o detalhe redireciona em vez de 404).
export default function CityLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <CityInvite />
      {children}
    </>
  );
}
