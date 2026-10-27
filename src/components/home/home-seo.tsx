// SEO da home (Server Component): o <h1> da página (a home sem hero não tinha nenhum), um texto
// curto indexável e o JSON-LD (WebSite com busca + Organization). Tudo derivado de `site` no
// kizuna.config.json e da cidade — nada de texto fixo de uma cidade específica.
import Link from 'next/link';
import { jsonLdScript } from '@kizuna/core/server';
import type { RoutableCity } from '@kizuna/core/shared/city-routing/city-slug';
import { SEO_SITE } from '@/lib/seo';
import cfg from '@/../kizuna.config.json';

type HomeSeoProps = {
  city: RoutableCity | null;
  /** Com o hero ligado o <h1> já é o dele; sem hero, este componente o emite (visualmente oculto). */
  showHero: boolean;
};

export function homeHeading(city: RoutableCity | null): string {
  return city
    ? `O que fazer em ${city.name}, ${city.state}: eventos, lugares e lazer`
    : `${SEO_SITE.name}: eventos, lugares e lazer`;
}

export function HomeSeo({ city, showHero }: HomeSeoProps) {
  const place = city ? `${city.name}, ${city.state}` : 'sua cidade';
  const searchHref = city
    ? `/busca?state=${city.state}&cityId=${city.ibge}&cityName=${encodeURIComponent(city.name)}`
    : '/busca';
  const logo = (cfg.site as { logo?: string }).logo;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${SEO_SITE.url}/#website`,
        url: SEO_SITE.url,
        name: SEO_SITE.name,
        inLanguage: 'pt-BR',
        description: SEO_SITE.defaultDescription,
        potentialAction: {
          '@type': 'SearchAction',
          target: { '@type': 'EntryPoint', urlTemplate: `${SEO_SITE.url}/busca?q={search_term_string}` },
          'query-input': 'required name=search_term_string',
        },
      },
      {
        '@type': 'Organization',
        '@id': `${SEO_SITE.url}/#organization`,
        name: SEO_SITE.name,
        url: SEO_SITE.url,
        ...(logo ? { logo: new URL(logo, SEO_SITE.url).toString() } : {}),
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />
      {showHero ? null : <h1 className="sr-only">{homeHeading(city)}</h1>}
      <section
        aria-labelledby="home-seo-title"
        className="mx-auto w-full max-w-[1600px] px-4 pb-14 sm:px-6 sm:pb-16"
      >
        <div className="max-w-3xl">
          <h2 id="home-seo-title" className="font-display text-xl font-extrabold tracking-tight sm:text-2xl">
            {city ? `Descubra ${city.name} com o ${SEO_SITE.name}` : `Descubra mais com o ${SEO_SITE.name}`}
          </h2>
          <p className="mt-3 text-sm leading-7 text-muted-foreground sm:text-base">
            {SEO_SITE.defaultDescription} Aqui você encontra a programação de {place}, confere onde ir
            e escolhe o que fazer hoje, no fim de semana ou no próximo feriado.
          </p>
          <p className="mt-3 text-sm leading-7 text-muted-foreground sm:text-base">
            Use a{' '}
            <Link href={searchHref} className="font-medium text-foreground underline underline-offset-4">
              busca
            </Link>{' '}
            para filtrar por categoria, data e região, ou role a página pelos eventos, cinema e lugares
            em destaque.
          </p>
        </div>
      </section>
    </>
  );
}
