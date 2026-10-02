import type { Metadata } from 'next';
import { EleicaoPage } from '@/components/eleicao/eleicao-page';

export const metadata: Metadata = {
  title: 'Eleição 2026: apuração para Presidente',
  description:
    'Acompanhe a apuração dos votos para Presidente em 2026, no Brasil e por estado, com dados do TSE.',
  alternates: { canonical: '/eleicao' },
  openGraph: {
    title: 'Eleição 2026: apuração para Presidente',
    description: 'Resultados nacionais e por estado, com dados do TSE.',
    locale: 'pt_BR',
    type: 'website',
  },
};

export default function EleicaoRoute() {
  return <EleicaoPage />;
}
