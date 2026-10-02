'use client';

import { useEffect } from 'react';
import { useUserLocation } from '@kizuna/core/client/hooks/use-user-location';
import { CITY_COOKIE, citySlug } from '@kizuna/core/shared/city-routing/city-slug';

/**
 * Espelha a cidade salva (localStorage) no cookie `kz_city`, que o servidor lê em `/` pra
 * redirecionar à cidade do usuário. Só escreve; nunca navega (detecção por IP/GPS não move a tela).
 */
export function CityCookieSync() {
  const { location } = useUserLocation();
  const cityName = location?.cityName;
  const stateCode = location?.stateCode;

  useEffect(() => {
    if (!cityName || !stateCode) return;
    document.cookie = `${CITY_COOKIE}=${citySlug(cityName, stateCode)}; path=/; max-age=31536000; samesite=lax`;
  }, [cityName, stateCode]);

  return null;
}
