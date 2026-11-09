// Montagem das páginas /anuncie: só liga os blocos do core ao conteúdo de `@/lib/anuncie`.
import Link from 'next/link';
import { Building2, CalendarDays, Clapperboard, Compass, Mail, MapPin, Martini } from 'lucide-react';
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
  contactFor,
  type Audience,
  type Contact,
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

/** Botão do canal configurado (WhatsApp ou e-mail). Sem canal, nada aparece. */
function ContactButton({ contact }: { contact: Contact | null }) {
  if (!contact) return null;
  return <WhatsAppButton href={contact.href} label={contact.label} icon={contact.kind === 'email' ? Mail : undefined} />;
}

function FinalCta({ contact }: { contact: Contact | null }) {
  // E-mail como linha extra só quando o botão principal é o WhatsApp (senão o botão já é o e-mail).
  const extraEmail = contact?.kind === 'whatsapp' && CONTACT_EMAIL;
  return (
    <LandingCta
      id={END_ID}
      title={contact ? 'Vamos conversar?' : 'Veja o Bora funcionando'}
      text={
        contact
          ? `Chame a gente ${contact.kind === 'whatsapp' ? 'no WhatsApp' : 'por e-mail'}. Anunciar é gratuito.`
          : 'Anunciar é gratuito.'
      }
      footnote={
        extraEmail ? (
          <>
            Ou escreva para{' '}
            <a className="font-semibold underline underline-offset-4" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
          </>
        ) : undefined
      }
    >
      <ContactButton contact={contact} />
      {contact ? <HojeLink /> : <HojeLink primary />}
    </LandingCta>
  );
}

function HojeLink({ primary = false }: { primary?: boolean }) {
  return (
    <Link
      href="/hoje"
      className={`inline-flex min-h-12 items-center justify-center rounded-full px-6 text-base font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        primary
          ? 'bg-primary text-primary-foreground shadow-md shadow-primary/25 hover:brightness-95'
          : 'bg-background text-foreground ring-1 ring-border hover:bg-muted'
      }`}
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
  const contact = contactFor(a.whatsappMessage);
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
          {contact ? <ContactButton contact={contact} /> : null}
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
      <FinalCta contact={contact} />
      {contact ? (
        <>
          <StickySpacer />
          <LandingStickyCta href={contact.href} label={contact.label} heroId={HERO_ID} endId={END_ID} />
        </>
      ) : null}
    </>
  );
}

export function AnuncieIndex() {
  const contact = contactFor(GENERIC_WHATSAPP_MESSAGE);
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
          {contact ? <ContactButton contact={contact} /> : null}
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
      <FinalCta contact={contact} />
      {contact ? (
        <>
          <StickySpacer />
          <LandingStickyCta href={contact.href} label={contact.label} heroId={HERO_ID} endId={END_ID} />
        </>
      ) : null}
    </>
  );
}
