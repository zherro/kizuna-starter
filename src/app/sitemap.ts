import type { MetadataRoute } from 'next';
import cfg from '@/../kizuna.config.json';
import { cityPath, serviceHref } from '@kizuna/core/shared/city-routing/city-slug';
import { loadRoutableCities } from '@kizuna/core/server/location/cities';
import { runServiceSearch } from '@kizuna/core/server/services/service-search';
import { loadEntries } from '@kizuna/core/server/content';
import { LUGARES } from '@/lib/lugares';
import { loadTurismo } from '@/lib/turismo';

// Sitemap vivo: anúncios novos entram em até 1h (sem rebuild).
export const revalidate = 3600;

const PAGE_SIZE = 100;
const MAX_PAGES = 100; // teto de 10k anúncios (limite do protocolo é 50k por arquivo)

type Entry = MetadataRoute.Sitemap[number];

/** Todos os anúncios ativos, com o link canônico (cidade na URL) — o mesmo que o card usa. */
async function loadAdEntries(url: string): Promise<Entry[]> {
  const out: Entry[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const rows = await runServiceSearch({ p_page: page, p_page_size: PAGE_SIZE }, 0);
    for (const r of rows) {
      out.push({ url: `${url}${serviceHref(r)}`, changeFrequency: 'weekly', priority: 0.7 });
    }
    if (rows.length < PAGE_SIZE) break;
  }
  return out;
}

// Páginas públicas. Adicione aqui as rotas públicas do seu app.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const url = (cfg.site?.url ?? 'http://localhost:3000').replace(/\/$/, '');
  const cities = await loadRoutableCities().catch(() => []);
  const ads = await loadAdEntries(url).catch(() => []);
  const lugares = loadEntries(LUGARES).entries.map((e) => ({
    url: `${url}/${e.data.cidade}/lugares/${e.slug}`,
    lastModified: e.data.atualizado_em ? new Date(String(e.data.atualizado_em)) : undefined,
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }));
  const turismo = loadTurismo();
  const toEntry = (path: string, priority: number) => ({ url: `${url}${path}`, changeFrequency: 'monthly' as const, priority });
  return [
    { url: `${url}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${url}/descobrir`, changeFrequency: 'daily', priority: 0.7 },
    { url: `${url}/sobre`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${url}/contato`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${url}/privacidade`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${url}/termos`, changeFrequency: 'yearly', priority: 0.3 },
    ...cities.map((city) => ({
      url: `${url}${cityPath(city)}`,
      changeFrequency: 'daily' as const,
      priority: 0.8,
    })),
    ...lugares,
    ...[`/hoje`, ...cities.map((c) => cityPath(c, '/hoje'))].map((p) => ({ url: `${url}${p}`, changeFrequency: 'daily' as const, priority: 0.7 })),
    { url: `${url}/mapa`, changeFrequency: 'weekly' as const, priority: 0.6 },
    ...['/turismo', '/turismo/rotas', '/turismo/dormir', '/turismo/comer', '/turismo/o-que-fazer', '/turismo/regioes'].map((p) => toEntry(p, p === '/turismo' ? 0.8 : 0.6)),
    ...turismo.rotas.map((r) => toEntry(r.href, 0.6)),
    ...turismo.regioes.map((r) => toEntry(r.href, 0.6)),
    ...ads,
  ];
}
