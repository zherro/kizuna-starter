// Menu do painel — fonte única: a barra lateral (`panel-shell.tsx`) e a tela de papéis
// (`/painel/root/papeis`, via `panelMenuForRoles`) leem esta lista, então um item novo aparece nos
// dois com o mesmo nome. Sem 'use client': também é importado por Server Components.
import {
  BarChart3,
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
  LifeBuoy,
  LockKeyhole,
  Network,
  PlusCircle,
  NotebookPen,
  Settings,
  Star,
  UserCircle,
  UserCog,
  HardDrive,
} from 'lucide-react';
import { vocabulary } from '@/lib/vocabulary';
import type { PanelNavGroup } from '@kizuna/core/client/components/panel-shell';
import type { RolesMenuItem } from '@kizuna/core/client/components/rbac/rbac-data';

export const navigationGroups: PanelNavGroup[] = [
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
        title: 'Avaliação',
        href: '/painel/administracao/avaliacoes',
        icon: Star,
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
      { title: 'Storage e imagens', href: '/painel/root/storage', icon: HardDrive, rootOnly: true },
      {
        title: 'Log de acesso root',
        href: '/painel/security/root-access-log',
        icon: LockKeyhole,
        rootOnly: true,
      },
    ],
  },
];

/** O menu achatado e serializável (sem ícone) para a tela de papéis e permissões. */
export function panelMenuForRoles(): RolesMenuItem[] {
  return navigationGroups.flatMap((group) =>
    group.items
      .filter((item) => !item.devOnly)
      .map((item) => ({
        title: item.title,
        group: group.title,
        permResource: item.permResource,
        rootOnly: item.rootOnly,
      }))
  );
}
