// Montagem das páginas de turismo: só liga os blocos do core (kizuna-core/.../turismo) aos dados
// de `@/lib/turismo`. Server Components; nenhuma regra de negócio aqui.
import { jsonLdScript } from '@kizuna/core/server';
import {
  PlaceCard,
  PlaceGrid,
  RegionCard,
  RouteCard,
  TurismoEmpty,
  TurismoGrid,
  TurismoHero,
  TurismoSection,
  TurismoSubnav,
  type RouteCardItem,
} from '@kizuna/core/client/components/turismo';
import type { Turismo, TurismoRota } from '@/lib/turismo';
import { itemListJsonLd } from '@/lib/turismo-seo';
import { SEO_SITE } from '@/lib/seo';

export const TURISMO_NAV = [
  { href: '/turismo/rotas', label: 'Rotas' },
  { href: '/turismo/dormir', label: 'Onde dormir' },
  { href: '/turismo/comer', label: 'Onde comer' },
  { href: '/turismo/o-que-fazer', label: 'O que fazer' },
  { href: '/turismo/regioes', label: 'Regiões' },
];

export const toRouteCard = (r: TurismoRota): RouteCardItem => ({
  href: r.href,
  title: r.title,
  summary: r.summary,
  tema: r.tema,
  duracao: r.duracao,
  dificuldade: r.dificuldade,
  paradas: r.paradas.length,
  photo: r.photo,
});

export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(data) }} />;
}

/** Cabeçalho das páginas de turismo, com a faixa de atalhos entre as seções. */
export function TurismoHeader({
  title,
  summary,
  currentHref,
  as,
}: {
  title: string;
  summary: string;
  currentHref?: string;
  as?: 'h1' | 'h2';
}) {
  return (
    <TurismoHero title={title} summary={summary} as={as}>
      <TurismoSubnav items={TURISMO_NAV} currentHref={currentHref} />
    </TurismoHero>
  );
}

const total = (d: Turismo) => d.rotas.length + d.dormir.length + d.comer.length + d.atracoes.length + d.regioes.length;

const PREVIEW = 4;

/**
 * Entrada de turismo (global ou de uma cidade/praça): hero, rotas em destaque, dormir, comer, o que
 * fazer, regiões e a seção da Chapada. Seção sem conteúdo some; sem conteúdo nenhum, estado vazio.
 */
export function TurismoLanding({
  data,
  title,
  summary,
  chapada,
}: {
  data: Turismo;
  title: string;
  summary: string;
  /** Conteúdo da Chapada dos Guimarães (só na entrada global). */
  chapada?: { href: string; data: Turismo } | null;
}) {
  const chapadaCards = chapada
    ? [
        ...chapada.data.rotas.slice(0, PREVIEW).map((r) => <RouteCard key={r.href} item={toRouteCard(r)} />),
        ...chapada.data.atracoes.slice(0, PREVIEW).map((l) => <PlaceCard key={l.href} item={l} />),
      ].slice(0, PREVIEW)
    : [];

  return (
    <>
      <TurismoHeader title={title} summary={summary} />
      <div className="pb-14">
        {total(data) === 0 ? (
          <div className="mx-auto w-full max-w-[1280px] px-4 pt-10 sm:px-6">
            <TurismoEmpty
              actionHref="/busca"
              actionLabel="Buscar lugares"
              description="Estamos apurando rotas, hospedagens e restaurantes para você. Enquanto isso, veja o que já está no ar."
            />
          </div>
        ) : null}
        <TurismoSection
          title="Rotas em destaque"
          description="Roteiros prontos, com paradas, duração e nível de dificuldade."
          moreHref="/turismo/rotas"
        >
          {data.rotas.slice(0, PREVIEW).map((r) => (
            <RouteCard key={r.href} item={toRouteCard(r)} />
          ))}
        </TurismoSection>
        <TurismoSection title="Onde dormir" moreHref="/turismo/dormir">
          {data.dormir.slice(0, PREVIEW).map((l) => (
            <PlaceCard key={l.href} item={l} />
          ))}
        </TurismoSection>
        <TurismoSection title="Onde comer" moreHref="/turismo/comer">
          {data.comer.slice(0, PREVIEW).map((l) => (
            <PlaceCard key={l.href} item={l} />
          ))}
        </TurismoSection>
        <TurismoSection title="O que fazer" moreHref="/turismo/o-que-fazer">
          {data.atracoes.slice(0, PREVIEW).map((l) => (
            <PlaceCard key={l.href} item={l} />
          ))}
        </TurismoSection>
        <TurismoSection
          title="Regiões e distritos"
          description="Cada canto da Grande Cuiabá tem um jeito próprio de receber."
          moreHref="/turismo/regioes"
        >
          {data.regioes.slice(0, PREVIEW).map((r) => (
            <RegionCard key={r.href} item={r} />
          ))}
        </TurismoSection>
        {chapada ? (
          <TurismoSection
            title="Chapada dos Guimarães"
            description="A poucos quilômetros de Cuiabá: cachoeiras, mirantes e trilhas."
            moreHref={chapada.href}
            moreLabel="Ver a Chapada"
          >
            {chapadaCards}
          </TurismoSection>
        ) : null}
      </div>
      {data.rotas.length > 0 ? (
        <JsonLd
          data={itemListJsonLd(
            SEO_SITE,
            title,
            data.rotas.map((r) => ({ name: r.title, path: r.href }))
          )}
        />
      ) : null}
    </>
  );
}

/** Página de lista (rotas, regiões...): hero, grade e ItemList. `children` é a grade ou o vazio. */
export function TurismoListPage({
  title,
  summary,
  currentHref,
  items,
  children,
}: {
  title: string;
  summary: string;
  currentHref: string;
  items: { name: string; path: string }[];
  children: React.ReactNode;
}) {
  return (
    <>
      <TurismoHeader title={title} summary={summary} currentHref={currentHref} />
      <div className="mx-auto w-full max-w-[1280px] px-4 pb-14 pt-8 sm:px-6">{children}</div>
      {items.length > 0 ? <JsonLd data={itemListJsonLd(SEO_SITE, title, items)} /> : null}
    </>
  );
}

export { TurismoGrid, TurismoEmpty };

/** Lista de lugares com filtros (dormir, comer, o que fazer). */
export function TurismoPlacesPage({
  title,
  summary,
  currentHref,
  places,
  regioes,
  emptyDescription,
}: {
  title: string;
  summary: string;
  currentHref: string;
  places: Turismo['dormir'];
  regioes: Turismo['regioes'];
  emptyDescription: string;
}) {
  return (
    <TurismoListPage
      title={title}
      summary={summary}
      currentHref={currentHref}
      items={places.map((p) => ({ name: p.title, path: p.href }))}
    >
      <PlaceGrid
        items={places}
        regioes={regioes.map((r) => ({ slug: r.slug, title: r.title }))}
        empty={{
          title: 'Estamos conferindo esta lista',
          description: emptyDescription,
          actionHref: '/turismo',
          actionLabel: 'Voltar ao turismo',
        }}
      />
    </TurismoListPage>
  );
}
