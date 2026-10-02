'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { UserLocation } from '@kizuna/core/client/hooks/use-user-location';
import { ViewingCityMarker } from '@kizuna/core/client/components/viewing-city';
import { cityPath, type RoutableCity } from '@kizuna/core/shared/city-routing/city-slug';

/**
 * Declara "esta página mostra a cidade X" (topo e seletor passam a refletir a URL). Quando o
 * usuário grava outra cidade no seletor, navega pra ela (`targetRest` mantém o sufixo, ex.: a
 * mesma categoria); gravar a própria cidade da URL não navega.
 */
export function CityRouteMarker({
  city,
  targetRest = '',
}: {
  city: RoutableCity;
  targetRest?: string;
}) {
  const router = useRouter();
  const onConfirm = useCallback(
    (loc: UserLocation) => {
      if (String(loc.cityId) === city.ibge) return;
      router.push(cityPath({ name: loc.cityName, state: loc.stateCode }, targetRest));
    },
    [city.ibge, router, targetRest]
  );

  return (
    <ViewingCityMarker
      city={{
        cityId: Number(city.ibge),
        cityName: city.name,
        stateCode: city.state,
        stateName: city.stateName,
      }}
      onConfirm={onConfirm}
    />
  );
}
