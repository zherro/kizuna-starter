import type { Metadata } from 'next';
import { EleicaoPage } from '@/components/eleicao/eleicao-page';

const TITLE = 'Eleições 2026 — Presidente, Governador, Senador e Deputados';
const DESCRIPTION =
  'Acompanhe a apuração das Eleições 2026 para Presidente, Governador, Senador, Deputado Federal e Deputado Estadual, no Brasil e por estado, com dados do TSE.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/eleicao' },
  openGraph: {
    title: TITLE,
    description: 'Resultados de Presidente, Governador, Senador e Deputados, com dados do TSE.',
    locale: 'pt_BR',
    type: 'website',
  },
};

export default function EleicaoRoute() {
  return <EleicaoPage />;
}
