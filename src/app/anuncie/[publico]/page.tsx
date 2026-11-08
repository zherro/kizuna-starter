import { notFound } from 'next/navigation';
import { AudiencePage, anuncieMetadata } from '@/components/anuncie/anuncie-parts';
import { AUDIENCES, audienceHref, findAudience } from '@/lib/anuncie';

// Só os quatro públicos existem; qualquer outro endereço é 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return AUDIENCES.map((a) => ({ publico: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ publico: string }> }) {
  const a = findAudience((await params).publico);
  if (!a) return {};
  return anuncieMetadata({ title: a.seoTitle, description: a.seoDescription, path: audienceHref(a.slug) });
}

export default async function AnunciePublicoPage({ params }: { params: Promise<{ publico: string }> }) {
  const a = findAudience((await params).publico);
  if (!a) notFound();
  return <AudiencePage a={a} />;
}
