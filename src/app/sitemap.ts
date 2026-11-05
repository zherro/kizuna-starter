import type { MetadataRoute } from 'next';
import cfg from '@/../kizuna.config.json';
import { cityPath } from '@kizuna/core/shared/city-routing/city-slug';
import { loadRoutableCities } from '@kizuna/core/server/location/cities';
import { loadEntries } from '@kizuna/core/server/content';
import { LUGARES } from '@/lib/lugares';
import { loadTurismo } from '@/lib/turismo';
import { loadAdEntries } from '@/lib/sitemap-ads';

// Sitemap vivo: anúncios novos entram em até 1h (sem rebuild). Se a busca de anúncios falhar, a
// geração lança e o Next segue servindo o último sitemap bom (ver `loadAdEntries`).
export const revalidate = 3600;

// Google e Bing só usam `lastmod`; `priority`/`changefreq` são ignorados, por isso não saem aqui.
// A `/` fica de fora: sem cookie ela redireciona (307) para a cidade padrão, e URL com redirect
// não deve estar no sitemap — a home de cada cidade já está na lista.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const url = (cfg.site?.url ?? 'http://localhost:3000').replace(/\/$/, '');
  const cities = await loadRoutableCities().catch(() => []);
  const ads = await loadAdEntries(url);
  const at = (path: string) => ({ url: `${url}${path}` });

  const lugares = loadEntries(LUGARES).entries.map((e) => ({
    url: `${url}/${e.data.cidade}/lugares/${e.slug}`,
    lastModified: e.data.atualizado_em ? new Date(String(e.data.atualizado_em)) : undefined,
  }));
  const turismo = loadTurismo();

  return [
    ...['/descobrir', '/sobre', '/contato', '/privacidade', '/termos', '/mapa', '/hoje'].map(at),
    ...cities.flatMap((city) => [cityPath(city), cityPath(city, '/hoje'), cityPath(city, '/turismo')].map(at)),
    ...lugares,
    ...['/turismo', '/turismo/rotas', '/turismo/dormir', '/turismo/comer', '/turismo/o-que-fazer', '/turismo/regioes'].map(at),
    ...turismo.rotas.map((r) => at(r.href)),
    ...turismo.regioes.map((r) => at(r.href)),
    ...ads,
  ];
}
