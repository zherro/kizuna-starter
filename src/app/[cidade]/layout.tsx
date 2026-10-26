import type { ReactNode } from 'react';
import { CityInvite } from '@kizuna/core/client/components/city/city-invite';
import { parseRegions } from '@kizuna/core/shared/regions';
import cfg from '@/../kizuna.config.json';

// Cidades da mesma região não pedem troca (o convite só aparece para outra região).
const regions = parseRegions((cfg as { regions?: unknown }).regions);

// A validação da cidade fica em cada página (o detalhe redireciona em vez de 404).
export default function CityLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <CityInvite regions={regions} />
      {children}
    </>
  );
}
