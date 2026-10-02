import {
  parseAnalyticsConfig,
  resolveEventRule,
  type AnalyticsEvent,
} from '@kizuna/core/shared/analytics';
import cfg from '@/../kizuna.config.json';

export const analyticsConfig = parseAnalyticsConfig((cfg as { analytics?: unknown }).analytics);

/** Regra do evento para o `<TrackView rule={...}>` (calculada no servidor, passada por prop). */
export const trackRule = (entityType: string, event: AnalyticsEvent) =>
  resolveEventRule(analyticsConfig, entityType, event);
