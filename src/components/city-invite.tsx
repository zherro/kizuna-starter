'use client';

import { useState } from 'react';
import { MapPin } from 'lucide-react';
import { useUserLocation } from '@kizuna/core/client/hooks/use-user-location';
import { LocationModal } from '@kizuna/core/client/components/location-modal';
import { useViewingCity } from '@kizuna/core/client/components/viewing-city';

/**
 * Convite discreto quando a URL mostra uma cidade diferente da salva: "Ver mais serviços em
 * Cuiabá" (ou "Escolher minha cidade" sem cidade salva). Abre o seletor em modo de confirmação.
 */
export function CityInvite() {
  const { location, ready } = useUserLocation();
  const viewing = useViewingCity();
  const [open, setOpen] = useState(false);

  if (!viewing || !ready) return null;
  if (location && location.cityId === viewing.cityId) return null;

  return (
    <>
      <div className="mx-auto w-full max-w-[1600px] px-4 pt-3 sm:px-6">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
        >
          <MapPin className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          {location?.cityName
            ? `Ver mais serviços em ${location.cityName}`
            : 'Escolher minha cidade'}
        </button>
      </div>
      <LocationModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
