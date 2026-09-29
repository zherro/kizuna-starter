'use client';

// EXEMPLO — este é o menu do painel. Edite `navigationGroups` e `branding`
// conforme o seu app. Os links abaixo apontam só para telas que o kizuna-core
// já entrega (resolvidas por /painel/[...kizuna] e /painel/root|security/[slug]).
import {
  Blocks,
  Briefcase,
  CalendarDays,
  ClipboardCheck,
  FileText,
  FlaskConical,
  FolderTree,
  GitFork,
  Home,
  KeyRound,
  LayoutGrid,
  LockKeyhole,
  Network,
  PlusCircle,
  NotebookPen,
  Settings,
  Star,
  UserCircle,
  UserCog,
} from 'lucide-react';
import { usePathname } from 'next/navigation';
import cfg from '@/../kizuna.config.json';
import {
  PanelShellBase,
  type PanelNavGroup,
  type PanelTopAction,
} from '@kizuna/core/client/components/panel-shell';

const site = (cfg as { site?: { name?: string; logo?: string } }).site;
const siteName = site?.name ?? 'Kizuna';

const navigationGroups: PanelNavGroup[] = [
  {
    title: 'Meu conteúdo',
    items: [
      {
        title: 'Novo',
        href: '/painel/meus-servicos/novo',
        icon: PlusCircle,
        permResource: 'default',
      },
      {
        title: 'Ver todos',
        href: '/painel/meus-servicos',
        icon: Briefcase,
        permResource: 'default',
      },
      {
        title: 'Avaliação',
        href: '/painel/administracao/avaliacoes',
        icon: Star,
        permResource: 'default',
      },
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
  {
    title: 'Catálogo',
    items: [
      {
        title: 'Categorias',
        href: '/painel/taxonomia/categorias',
        icon: FolderTree,
        permResource: 'categories',
      },
      {
        title: 'Subcategorias',
        href: '/painel/taxonomia/subcategorias',
        icon: GitFork,
        permResource: 'categories',
      },
      {
        title: 'Árvore',
        href: '/painel/taxonomia/arvore',
        icon: Network,
        permResource: 'categories',
      },
    ],
  },
  {
    title: 'Conteúdo',
    items: [
      {
        title: 'Formulários',
        href: '/painel/administracao/formularios',
        icon: NotebookPen,
        permResource: 'forms',
      },
      {
        title: 'Páginas',
        href: '/painel/administracao/paginas',
        icon: FileText,
        permResource: 'pages',
      },
      { title: 'Agenda', href: '/painel/agenda', icon: CalendarDays, permResource: 'agenda' },
    ],
  },
  {
    title: 'Configuração',
    items: [
      {
        title: 'Minha conta',
        href: '/painel/minha-conta',
        icon: UserCircle,
        permResource: 'default',
      },
    ],
  },
  {
    title: 'Administração',
    items: [
      {
        title: 'Acessos dos usuários',
        href: '/painel/administracao/acessos',
        icon: UserCog,
        rootOnly: true,
      },
      {
        title: 'Aprovações',
        href: '/painel/administracao/aprovacoes',
        icon: ClipboardCheck,
        rootOnly: true,
      },
      { title: 'Teste de funções', href: '/painel/funcoes', icon: FlaskConical, devOnly: true, rootOnly: true },
    ],
  },
  {
    title: 'Root',
    items: [
      { title: 'Plugins instalados', href: '/painel/root/plugins', icon: Blocks, rootOnly: true },
      { title: 'Papéis e permissões', href: '/painel/root/papeis', icon: KeyRound, rootOnly: true },
      {
        title: 'Configurações',
        href: '/painel/root/configuracoes',
        icon: Settings,
        rootOnly: true,
      },
      {
        title: 'Log de acesso root',
        href: '/painel/security/root-access-log',
        icon: LockKeyhole,
        rootOnly: true,
      },
    ],
  },
];

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
