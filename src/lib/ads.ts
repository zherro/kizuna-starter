import cfg from '@/../kizuna.config.json';

type AdsCfg = { adsenseClient?: string; maxSlotsPerPage?: number };
const raw = ((cfg as { ads?: AdsCfg }).ads ?? {}) as AdsCfg;

export const adsConfig = {
  adsenseClient: /^ca-pub-\d{10,20}$/.test(raw.adsenseClient ?? '') ? (raw.adsenseClient as string) : '',
  maxSlotsPerPage: Math.min(Math.max(raw.maxSlotsPerPage ?? 3, 1), 10),
};
