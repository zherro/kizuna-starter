'use client';

// EXEMPLO — casca do painel. O menu (`navigationGroups`) fica em ./panel-nav.ts; edite `branding`
// conforme o seu app. Os links abaixo apontam só para telas que o kizuna-core
// já entrega (resolvidas por /painel/[...kizuna] e /painel/root|security/[slug]).
import {
  Home,
  LayoutGrid,
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

const site = (cfg as { site?: { name?: string; logo?: string | null } }).site;
const siteName = site?.name ?? 'Kizuna';


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
