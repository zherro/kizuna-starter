import cfg from '@/../kizuna.config.json';

type AdsCfg = { adsenseClient?: string; maxSlotsPerPage?: number; paidSharePercent?: number };
const raw = ((cfg as { ads?: AdsCfg }).ads ?? {}) as AdsCfg;

const pct = typeof raw.paidSharePercent === 'number' && Number.isFinite(raw.paidSharePercent) ? raw.paidSharePercent : 70;

export const adsConfig = {
  adsenseClient: /^ca-pub-\d{10,20}$/.test(raw.adsenseClient ?? '') ? (raw.adsenseClient as string) : '',
  maxSlotsPerPage: Math.min(Math.max(raw.maxSlotsPerPage ?? 3, 1), 10),
  /** Fração (0..1) das exibições para banners pagos quando há campanha no ar no espaço. */
  paidShare: Math.min(Math.max(pct, 0), 100) / 100,
};

export { AD_FREE_ROUTES, isAdFreeRoute } from './ad-free-routes';
