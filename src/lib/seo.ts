import type { SeoSite } from '@kizuna/core/server';
import cfg from '../../kizuna.config.json';

/**
 * `SeoSite` deste projeto, montado uma vez a partir de `site` no `kizuna.config.json` — toda
 * página pública que usa `buildMetadata`/`serviceJsonLd`/`breadcrumbJsonLd` (`@kizuna/core/server`)
 * importa daqui em vez de remontar os mesmos campos.
 */
export const SEO_SITE: SeoSite = {
  name: cfg.site.name,
  url: cfg.site.url.replace(/\/$/, ''),
  defaultDescription: cfg.site.description,
  defaultOgImage: cfg.site.logo || '/icon.png',
  locale: 'pt_BR',
};
