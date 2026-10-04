'use client';

// EXEMPLO — casca do painel. O menu (`navigationGroups`) fica em ./panel-nav.ts; edite `branding`
// conforme o seu app. Os links abaixo apontam só para telas que o kizuna-core
// já entrega (resolvidas por /painel/[...kizuna] e /painel/root|security/[slug]).
import {
  Home,
  LayoutGrid,
<<<<<<< HEAD
=======
  LifeBuoy,
  LockKeyhole,
  Network,
  Sparkles,
  PlusCircle,
  NotebookPen,
  Settings,
  Star,
>>>>>>> 4f07107 (IA text review)
  UserCircle,
} from 'lucide-react';
import { usePathname } from 'next/navigation';
import cfg from '@/../kizuna.config.json';
import {
  PanelShellBase,
  type PanelTopAction,
} from '@kizuna/core/client/components/panel-shell';
import { navigationGroups } from './panel-nav';
import { OpenTicketsBadge } from '@kizuna/core/client/components/tickets/open-tickets-badge';

const site = (cfg as { site?: { name?: string; logo?: string } }).site;
const siteName = site?.name ?? 'Kizuna';

<<<<<<< HEAD
=======
const navigationGroups: PanelNavGroup[] = [
  {
    title: 'Meu conteúdo',
    items: [
      {
        title: vocabulary.phrases.new,
        href: '/painel/meus-servicos/novo',
        icon: PlusCircle,
        permResource: 'default',
      },
      {
        title: vocabulary.phrases.mine,
        href: '/painel/meus-servicos',
        icon: Briefcase,
        permResource: 'default',
      },
      {
        title: 'Métricas',
        href: '/painel/metricas',
        icon: BarChart3,
        permResource: 'default',
      },
      {
        title: 'Avaliações',
        href: '/painel/administracao/avaliacoes',
        icon: Star,
        permResource: 'default',
      },
    ],
  },
  {
    title: 'Conta',
    items: [
      {
        title: 'Minha conta',
        href: '/painel/minha-conta',
        icon: UserCircle,
        permResource: 'default',
      },
      {
        // Plugin tickets. Contador de abertos ao lado (renderItemBadge abaixo).
        title: 'Chamados',
        href: '/painel/chamados',
        icon: LifeBuoy,
        permResource: 'default',
      },
    ],
  },
  {
    title: 'Conteúdo',
    items: [
      { title: 'Agenda', href: '/painel/agenda', icon: CalendarDays, permResource: 'agenda' },
      {
        title: 'Páginas',
        href: '/painel/administracao/paginas',
        icon: FileText,
        permResource: 'pages',
      },
      {
        title: 'Formulários',
        href: '/painel/administracao/formularios',
        icon: NotebookPen,
        permResource: 'forms',
      },
    ],
  },
  {
    title: 'Catálogo',
    items: [
      {
        title: 'Árvore',
        href: '/painel/taxonomia/arvore',
        icon: Network,
        permResource: 'categorias',
      },
      {
        title: 'Categorias',
        href: '/painel/taxonomia/categorias',
        icon: FolderTree,
        permResource: 'categorias',
      },
      {
        title: 'Subcategorias',
        href: '/painel/taxonomia/subcategorias',
        icon: GitFork,
        permResource: 'categorias',
      },
    ],
  },
  {
    title: 'Moderação',
    items: [
      {
        title: 'Aprovações',
        href: '/painel/administracao/aprovacoes',
        icon: ClipboardCheck,
        rootOnly: true,
      },
      {
        title: 'Revisão por IA',
        href: '/painel/administracao/revisao-ia',
        icon: Sparkles,
        rootOnly: true,
      },
      {
        title: 'Acessos dos usuários',
        href: '/painel/administracao/acessos',
        icon: UserCog,
        rootOnly: true,
      },
    ],
  },
  {
    title: 'Sistema',
    items: [
      {
        title: 'Configurações',
        href: '/painel/root/configuracoes',
        icon: Settings,
        rootOnly: true,
      },
      { title: 'Inteligência artificial', href: '/painel/root/ia', icon: Sparkles, rootOnly: true },
      { title: 'Plugins instalados', href: '/painel/root/plugins', icon: Blocks, rootOnly: true },
      { title: 'Papéis e permissões', href: '/painel/root/papeis', icon: KeyRound, rootOnly: true },
      {
        title: 'Log de acesso root',
        href: '/painel/security/root-access-log',
        icon: LockKeyhole,
        rootOnly: true,
      },
      { title: 'Teste de funções', href: '/painel/funcoes', icon: FlaskConical, devOnly: true, rootOnly: true },
    ],
  },
  {
    // Fora da lista: "Tela inicial" e "Painel" viram ícones no topo (topActions). Os itens ficam
    // aqui só para o gate de página — "/painel" é o item que libera as telas sem item próprio.
    title: 'Navegação',
    items: [
      {
        title: 'Tela inicial',
        href: '/',
        icon: Home,
        permResource: 'default',
        sidebarHidden: true,
      },
      {
        title: 'Painel',
        href: '/painel',
        icon: LayoutGrid,
        permResource: 'default',
        sidebarHidden: true,
      },
    ],
  },
];
>>>>>>> 4f07107 (IA text review)

export function PanelShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname() ?? '';
  const topActions: PanelTopAction[] = [
    { title: 'Tela inicial', href: '/', icon: Home },
    { title: 'Painel', href: '/painel', icon: LayoutGrid, isActive: pathname === '/painel' },
    {
      title: 'Minha conta',
      href: '/painel/minha-conta',
      icon: UserCircle,
      isActive: pathname.startsWith('/painel/minha-conta'),
    },
  ];

  return (
    <PanelShellBase
      navGroups={navigationGroups}
      topActions={topActions}
      topActionsIconOnly
      renderItemBadge={(item, collapsed) =>
        item.href === '/painel/chamados' && !collapsed ? <OpenTicketsBadge /> : null
      }
      branding={{
        kicker: siteName,
        shortLabel: siteName.slice(0, 2).toUpperCase(),
        fullLabel: siteName,
        // Mesma logo do header do site (site.logo); sem ela, o selo com as iniciais.
        logo: site?.logo || undefined,
      }}
    >
      {children}
    </PanelShellBase>
  );
}
