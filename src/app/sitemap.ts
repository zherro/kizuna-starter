import type { MetadataRoute } from 'next';
import cfg from '@/../kizuna.config.json';
import { cityPath } from '@kizuna/core/shared/city-routing/city-slug';
import { loadRoutableCities } from '@kizuna/core/server/location/cities';
import { loadEntries, type Entry } from '@kizuna/core/server/content';
import { LUGARES } from '@/lib/lugares';
import { REGIOES, ROTEIROS, loadTurismo } from '@/lib/turismo';
import { plazaCitySlugs } from '@/lib/turismo-scope';
import { loadAdEntries } from '@/lib/sitemap-ads';
import { ANUNCIE_PATHS } from '@/lib/anuncie';
import { TURISMO_PAGES, isPortalCityIbge, portalCitySlugs, turismoHasItems } from '@/lib/seo-index';

// Sitemap vivo: anúncios novos entram em até 1h (sem rebuild). Se a busca de anúncios falhar, a
// geração lança e o Next segue servindo o último sitemap bom (ver `loadAdEntries`).
export const revalidate = 3600;

/**
 * Só URL indexável entra (a mesma regra do `noindex` das páginas, em `@/lib/seo-index`):
 * - anúncios ativos da região do portal (`regions` + cidade padrão), sem evento vencido; notícias
 *   (grupo perene) ficam até 1 ano depois de vencer;
 * - páginas da cidade (home e /hoje) só das cidades do portal; /turismo e listagens de turismo só
 *   com item publicado;
 * - artigos editoriais aprovados (lugares, roteiros, regiões) com o `atualizado_em` como `lastmod`.
 * Fora: `/` (redireciona para a cidade), `/hoje` (canonical = /<cidade padrão>/hoje), `/busca`,
 * `/mapa` e `/descobrir` (ferramentas no cliente, `noindex`).
 *
 * Google e Bing só usam `lastmod`; `priority`/`changefreq` são ignorados, por isso não saem aqui.
 * Hoje são centenas de URLs (limite do protocolo: 50 mil por arquivo; os anúncios têm teto de 10 mil
 * em `sitemap-ads.ts`). Passando de ~5 mil, dividir com `generateSitemaps` (anúncios num arquivo à parte).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const url = (cfg.site?.url ?? 'http://localhost:3000').replace(/\/$/, '');
  const cities = await loadRoutableCities().catch(() => []);
  // Lista de cidades indisponível: não filtra por cidade (melhor que publicar um sitemap sem anúncios).
  const slugs = portalCitySlugs(cities);
  const citySlugs = slugs && slugs.size > 0 ? slugs : null;
  const inPortal = (slug: unknown) => !citySlugs || citySlugs.has(String(slug));
  const ads = await loadAdEntries(url, { citySlugs });
  const at = (path: string) => ({ url: `${url}${path}` });

  const lastmod = (e: Entry) => {
    const d = e.data.atualizado_em ? new Date(String(e.data.atualizado_em)) : null;
    return d && !Number.isNaN(d.getTime()) ? d : undefined;
  };
  const editorial = (entries: Entry[], segment: string) =>
    entries
      .filter((e) => inPortal(e.data.cidade))
      .map((e) => ({ url: `${url}/${e.data.cidade}/${segment}/${e.slug}`, lastModified: lastmod(e) }));

  const cityPages = await Promise.all(
    cities
      .filter((c) => isPortalCityIbge(c.ibge))
      .map(async (city) => {
        const paths = [cityPath(city), cityPath(city, '/hoje')];
        if (turismoHasItems(loadTurismo({ citySlugs: await plazaCitySlugs(city) }))) paths.push(cityPath(city, '/turismo'));
        return paths.map(at);
      })
  );
  const turismo = loadTurismo();

  return [
    ...['/sobre', '/contato', '/privacidade', '/termos', ...ANUNCIE_PATHS].map(at),
    ...cityPages.flat(),
    ...editorial(loadEntries(LUGARES).entries, 'lugares'),
    ...TURISMO_PAGES.filter((p) => turismoHasItems(turismo, p.section)).map((p) => at(p.path)),
    ...editorial(loadEntries(ROTEIROS).entries, 'roteiros'),
    ...editorial(loadEntries(REGIOES).entries, 'regioes'),
    ...ads,
  ];
}
