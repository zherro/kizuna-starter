// Montagem das páginas /anuncie: só liga os blocos do core ao conteúdo de `@/lib/anuncie`.
import Link from 'next/link';
import { Building2, CalendarDays, Clapperboard, Compass, MapPin, Martini } from 'lucide-react';
import { breadcrumbJsonLd, buildMetadata, jsonLdScript } from '@kizuna/core/server';
import {
  LandingCta,
  LandingHero,
  LandingLinkCards,
  LandingPoints,
  LandingPoster,
  LandingSteps,
  LandingStickyCta,
  WhatsAppButton,
} from '@kizuna/core/client/components/landing';
import { SEO_SITE } from '@/lib/seo';
import {
  AUDIENCES,
  BADGES,
  COMMON_SUMMARY,
  CONTACT_EMAIL,
  GENERIC_WHATSAPP_MESSAGE,
  PILLARS,
  PILLARS_INTRO,
  audienceHref,
  whatsappFor,
  type Audience,
} from '@/lib/anuncie';

const HERO_ID = 'anuncie-hero';
const END_ID = 'anuncie-fim';

const PILLAR_ICONS = [CalendarDays, Clapperboard, MapPin];
const AUDIENCE_ICONS: Record<string, typeof Building2> = {
  pousadas: Building2,
  bares: Martini,
  'produtores-de-eventos': CalendarDays,
  'guias-de-turismo': Compass,
};

export function anuncieMetadata(input: { title: string; description: string; path: string }) {
  const meta = buildMetadata(SEO_SITE, { ...input, image: null });
  // O título já traz a marca: `absolute` evita "… | Bora Cuiabá | Bora Cuiabá".
  return { ...meta, title: { absolute: input.title } };
}

function WebPageJsonLd({ name, description, path, crumbs }: { name: string; description: string; path: string; crumbs: { name: string; path: string }[] }) {
  const url = `${SEO_SITE.url}${path}`;
  const data = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name,
    description,
    url,
    inLanguage: 'pt-BR',
    isPartOf: { '@type': 'WebSite', name: SEO_SITE.name, url: SEO_SITE.url },
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(data) }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbJsonLd(SEO_SITE, crumbs)) }}
      />
    </>
  );
}

function FinalCta({ message }: { message: string }) {
  const href = whatsappFor(message);
  return (
    <LandingCta
      id={END_ID}
      title="Vamos conversar?"
      text="Chame a gente no WhatsApp. Anunciar é gratuito."
      footnote={
        CONTACT_EMAIL ? (
          <>
            Ou escreva para{' '}
            <a className="font-semibold underline underline-offset-4" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
          </>
        ) : undefined
      }
    >
      <WhatsAppButton href={href} />
      <WhatsAppLinkToHoje />
    </LandingCta>
  );
}

function WhatsAppLinkToHoje() {
  return (
    <Link
      href="/hoje"
      className="inline-flex min-h-12 items-center justify-center rounded-full bg-background px-6 text-base font-bold text-foreground ring-1 ring-border hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      Veja o Bora funcionando
    </Link>
  );
}

/** Reserva o espaço do botão fixo no celular, para ele não cobrir o fim do conteúdo. */
function StickySpacer() {
  return <div aria-hidden="true" className="h-16 md:hidden" />;
}

export function AudiencePage({ a }: { a: Audience }) {
  const href = whatsappFor(a.whatsappMessage);
  const path = audienceHref(a.slug);
  return (
    <>
      <WebPageJsonLd
        name={a.seoTitle}
        description={a.seoDescription}
        path={path}
        crumbs={[
          { name: 'Início', path: '/' },
          { name: 'Anuncie', path: '/anuncie' },
          { name: a.name, path },
        ]}
      />
      <div id={HERO_ID}>
        <LandingHero eyebrow={a.eyebrow} title={a.hook} summary={COMMON_SUMMARY} badges={BADGES}>
          <WhatsAppButton href={href} />
        </LandingHero>
      </div>
      <LandingPoints id="problema" title="O problema" items={a.problems} highlightLast />
      <LandingPoints
        id="o-bora"
        title="O que é o Bora Cuiabá"
        intro={PILLARS_INTRO}
        items={PILLARS.map((p, i) => ({ ...p, icon: PILLAR_ICONS[i] }))}
      />
      <LandingPoints id="ganha" title="O que você ganha" items={a.gains} />
      {a.poster ? (
        <LandingPoster id="cartaz" title={a.poster.title} quote={a.poster.quote} href="/hoje" linkLabel="Ver a página /hoje">
          <p>{a.poster.text}</p>
        </LandingPoster>
      ) : null}
      <LandingSteps id="como-entrar" title="Como entrar" steps={a.steps} />
      <FinalCta message={a.whatsappMessage} />
      <StickySpacer />
      <LandingStickyCta href={href} heroId={HERO_ID} endId={END_ID} />
    </>
  );
}

export function AnuncieIndex() {
  const href = whatsappFor(GENERIC_WHATSAPP_MESSAGE);
  return (
    <>
      <WebPageJsonLd
        name="Anuncie no Bora Cuiabá"
        description="Divulgue sua pousada, bar, evento ou passeio no Bora Cuiabá."
        path="/anuncie"
        crumbs={[
          { name: 'Início', path: '/' },
          { name: 'Anuncie', path: '/anuncie' },
        ]}
      />
      <div id={HERO_ID}>
        <LandingHero eyebrow="Anuncie" title="Seu negócio na lista de quem quer saber o que fazer hoje" summary={COMMON_SUMMARY} badges={BADGES}>
          <WhatsAppButton href={href} />
        </LandingHero>
      </div>
      <LandingLinkCards
        id="publicos"
        title="Quem pode anunciar"
        intro="Escolha o seu caso e veja como entrar."
        items={AUDIENCES.map((a) => ({
          href: audienceHref(a.slug),
          title: a.name,
          text: a.hook,
          icon: AUDIENCE_ICONS[a.slug],
        }))}
      />
      <LandingPoints
        id="o-bora"
        title="O que é o Bora Cuiabá"
        intro={PILLARS_INTRO}
        items={PILLARS.map((p, i) => ({ ...p, icon: PILLAR_ICONS[i] }))}
      />
      <FinalCta message={GENERIC_WHATSAPP_MESSAGE} />
      <StickySpacer />
      <LandingStickyCta href={href} heroId={HERO_ID} endId={END_ID} />
    </>
  );
}
