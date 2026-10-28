import type { MapGroupStyles } from '@kizuna/core/client/components/map';

/** Onde o mapa abre (Cuiabá). Com "Perto de mim", ele recentra no usuário. */
export const MAP_CENTER = { lat: -15.601, lng: -56.097 } as const;
export const MAP_ZOOM = 14;

/**
 * Estilo do pino por `category_group_slug` (cor + ícone + legenda). Grupo fora da lista usa a cor da
 * marca. Os matizes seguem `serviceDetail.colors` do kizuna.config.json.
 */
export const MAP_GROUP_STYLES: MapGroupStyles = {
  eventos: { label: 'Eventos', color: 'oklch(0.6 0.2 25)', icon: 'calendar' },
  'cultura-e-arte': { label: 'Cultura', color: 'oklch(0.55 0.17 300)', icon: 'palette' },
  lugares: { label: 'Lugares', color: 'oklch(0.55 0.13 165)', icon: 'map-pin' },
  cinema: { label: 'Cinema', color: 'oklch(0.5 0.19 268)', icon: 'film' },
  'bares-e-vida-noturna': { label: 'Bares', color: 'oklch(0.5 0.15 340)', icon: 'wine' },
};
