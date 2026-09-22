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
import { PanelShellBase, type PanelNavGroup } from '@kizuna/core/client/components/panel-shell';

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
    title: 'Navegação',
    items: [
      { title: 'Tela inicial', href: '/', icon: Home, permResource: 'default' },
      { title: 'Painel', href: '/painel', icon: LayoutGrid, permResource: 'default' },
      {
        title: 'Minha conta',
        href: '/painel/minha-conta',
        icon: UserCircle,
        permResource: 'default',
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
    title: 'Administração',
    items: [
      {
        title: 'Acessos dos usuários',
        href: '/painel/administracao/acessos',
        icon: UserCog,
        permResource: 'tenant_member',
      },
      {
        title: 'Aprovações',
        href: '/painel/administracao/aprovacoes',
        icon: ClipboardCheck,
        rootOnly: true,
      },
      { title: 'Teste de funções', href: '/painel/funcoes', icon: FlaskConical, devOnly: true },
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
  return (
    <PanelShellBase
      navGroups={navigationGroups}
      branding={{
        kicker: 'Kizuna',
        shortLabel: 'KZ',
        fullLabel: 'Kizuna',
      }}
    >
      {children}
    </PanelShellBase>
  );
}
