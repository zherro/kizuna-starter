'use client';

// Trilha da home com foco na cidade escolhida e cota para as cidades irmãs (`focusOnCity`).
// O HTML (ISR) sai com a escolha determinística do pool; com `shuffle`, cada visita sorteia de novo
// dentro do pool — a preferência da cidade e a cota das irmãs valem depois do sorteio.
import { useEffect, useState, type ComponentProps } from 'react';
import { ServiceCarouselSection } from '@kizuna/core/client/components/services/detail';
import type { ServiceResult } from '@kizuna/core/client/components/search/search-types';
import { focusOnCity, type CityFocusOptions } from '@/lib/city-focus';

type Props = Omit<ComponentProps<typeof ServiceCarouselSection>, 'services'> & {
  /** Pool maior que `limit`, já na ordem de preferência (data, relevância). */
  pool: ServiceResult[];
  focus: CityFocusOptions;
  /** Sorteia o pool a cada visita (trilhas sem ordem fixa). */
  shuffle?: boolean;
};

function shuffled<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function FocusedServiceRail({ pool, focus, shuffle = false, ...props }: Props) {
  const [visible, setVisible] = useState(() => focusOnCity(pool, focus).items);

  useEffect(() => {
    if (shuffle) setVisible(focusOnCity(shuffled(pool), focus).items);
    // `focus` é recriado a cada render do pai; as chaves dele são o que importa
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool, shuffle, focus.cityName, focus.limit, focus.sisterShare, focus.dedupeTitle, focus.arrange]);

  return <ServiceCarouselSection {...props} services={visible} />;
}
