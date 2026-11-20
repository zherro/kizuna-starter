'use client';

// Trilha da home com foco na cidade escolhida e cota para as cidades irmãs (`focusOnCity`).
// O HTML (ISR) sai com a escolha determinística do pool; com `shuffle`, cada visita sorteia de novo
// dentro do pool — a preferência da cidade e a cota das irmãs valem depois do sorteio. Impulsionamento:
// as vagas patrocinadas (`sponsor_slot`, escolhidas pelo banco) vêm antes de tudo, com rodízio por visita.
import { useEffect, useState, type ComponentProps } from 'react';
import { ServiceCarouselSection } from '@kizuna/core/client/components/services/detail';
import type { ServiceResult } from '@kizuna/core/client/components/search/search-types';
import type { CityFocusOptions } from '@/lib/city-focus';
import { arrangeRail } from '@/lib/sponsored-rail';

type Props = Omit<ComponentProps<typeof ServiceCarouselSection>, 'services'> & {
  /** Pool maior que `limit`, já na ordem de preferência (data, relevância). */
  pool: ServiceResult[];
  focus: CityFocusOptions;
  /** Sorteia o pool a cada visita (trilhas sem ordem fixa). */
  shuffle?: boolean;
  /** Impulsionamento (`marketing.boost.railSlots`): vagas patrocinadas no início da trilha. 0 = nenhuma. */
  sponsoredSlots?: number;
};

export function FocusedServiceRail({ pool, focus, shuffle = false, sponsoredSlots = 0, ...props }: Props) {
  // 1º render (servidor/hidratação): determinístico; depois, sorteio por visita
  const [visible, setVisible] = useState(() => arrangeRail(pool, focus, sponsoredSlots));

  useEffect(() => {
    const candidates = pool.filter((s) => (s.sponsor_slot ?? 0) > 0).length;
    if (shuffle || candidates > sponsoredSlots) {
      setVisible(arrangeRail(pool, focus, sponsoredSlots, { shuffle, rand: Math.random }));
    }
    // `focus` é recriado a cada render do pai; as chaves dele são o que importa
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool, shuffle, sponsoredSlots, focus.cityName, focus.limit, focus.sisterShare, focus.dedupeTitle, focus.arrange]);

  return <ServiceCarouselSection {...props} services={visible} />;
}
