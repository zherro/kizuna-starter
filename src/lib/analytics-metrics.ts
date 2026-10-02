// Catálogo das métricas de negócio do anunciante (rótulos, ícones, formatos).
// A home do painel mostra só as `featured`; /painel/metricas mostra todas. Os valores vêm do
// plugin `analytics` (`useOwnerStats` em @kizuna/core/client/analytics); métrica sem fonte = "—".
import {
  Eye,
  Heart,
  MessageCircle,
  MousePointerClick,
  Percent,
  Share2,
  Star,
  Timer,
  UserCheck,
  Users,
  Wallet,
  Megaphone,
  type LucideIcon,
} from 'lucide-react';
import type { PeriodDays } from '@kizuna/core/shared/analytics';

export type MetricGroup = 'alcance' | 'interesse' | 'conversao' | 'reputacao' | 'conta';

export type MetricFormat = 'int' | 'percent' | 'rating' | 'minutes';

export type MetricDef = {
  id: string;
  label: string;
  hint: string;
  group: MetricGroup;
  icon: LucideIcon;
  format: MetricFormat;
  /** Aparece na home do painel. */
  featured: boolean;
  /** Métrica de estoque (não varia com o período, sem delta). */
  snapshot?: boolean;
  href: string;
};

export const METRIC_GROUPS: Record<MetricGroup, string> = {
  alcance: 'Alcance',
  interesse: 'Interesse',
  conversao: 'Conversão',
  reputacao: 'Reputação',
  conta: 'Conta',
};

const ADS = '/painel/meus-servicos';

export const METRICS: MetricDef[] = [
  { id: 'impressions', label: 'Impressões', hint: 'Vezes que seus anúncios apareceram em buscas e listas.', group: 'alcance', icon: Megaphone, format: 'int', featured: false, href: ADS },
  { id: 'views', label: 'Visualizações', hint: 'Acessos à página do anúncio (tempo mínimo de tela configurável).', group: 'alcance', icon: Eye, format: 'int', featured: true, href: ADS },
  { id: 'uniques', label: 'Visitantes únicos', hint: 'Pessoas diferentes que viram seus anúncios.', group: 'alcance', icon: Users, format: 'int', featured: false, href: ADS },
  { id: 'ctr', label: 'CTR', hint: 'Visualizações ÷ impressões: mede o quanto título e foto atraem.', group: 'alcance', icon: Percent, format: 'percent', featured: false, href: ADS },
  { id: 'favorites', label: 'Favoritos', hint: 'Vezes que salvaram seus anúncios.', group: 'interesse', icon: Heart, format: 'int', featured: true, href: ADS },
  { id: 'shares', label: 'Compartilhamentos', hint: 'Vezes que seus anúncios foram compartilhados.', group: 'interesse', icon: Share2, format: 'int', featured: false, href: ADS },
  { id: 'contacts', label: 'Cliques no contato', hint: 'Cliques em WhatsApp/telefone: o interesse real.', group: 'conversao', icon: MousePointerClick, format: 'int', featured: true, href: ADS },
  { id: 'contactRate', label: 'Taxa de contato', hint: 'Cliques no contato ÷ visualizações.', group: 'conversao', icon: UserCheck, format: 'percent', featured: false, href: ADS },
  { id: 'conversations', label: 'Conversas', hint: 'Conversas iniciadas na plataforma.', group: 'conversao', icon: MessageCircle, format: 'int', featured: true, href: ADS },
  { id: 'rating', label: 'Avaliação', hint: 'Nota média dos seus anúncios.', group: 'reputacao', icon: Star, format: 'rating', featured: true, snapshot: true, href: ADS },
  { id: 'responseTime', label: 'Tempo de resposta', hint: 'Tempo médio até a primeira resposta.', group: 'reputacao', icon: Timer, format: 'minutes', featured: false, snapshot: true, href: ADS },
  { id: 'credits', label: 'Créditos', hint: 'Saldo disponível para destacar anúncios.', group: 'conta', icon: Wallet, format: 'int', featured: true, snapshot: true, href: '/painel/minha-conta' },
];

export const FEATURED_METRICS = METRICS.filter((m) => m.featured);

export type { PeriodDays };
export const PERIODS: { days: PeriodDays; label: string }[] = [
  { days: 7, label: '7 dias' },
  { days: 30, label: '30 dias' },
  { days: 90, label: '90 dias' },
];

export function formatMetric(format: MetricFormat, value: number): string {
  switch (format) {
    case 'percent':
      return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
    case 'rating':
      return value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    case 'minutes':
      return value >= 60 ? `${Math.round(value / 60)} h` : `${Math.round(value)} min`;
    default:
      return value.toLocaleString('pt-BR');
  }
}

export const SOURCE_LABELS: Record<string, string> = {
  search: 'Busca',
  home: 'Página inicial',
  category: 'Categorias',
  direct: 'Link direto',
  share: 'Compartilhamento',
  other: 'Outros',
};
