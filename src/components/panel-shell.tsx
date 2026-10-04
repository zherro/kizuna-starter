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
import { useAuth } from '@kizuna/core/client/providers/auth-provider';
import { navigationGroups } from './panel-nav';
import { OpenTicketsBadge } from '@kizuna/core/client/components/tickets/open-tickets-badge';

const site = (cfg as { site?: { name?: string; logo?: string } }).site;
const siteName = site?.name ?? 'Kizuna';

export function PanelShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname() ?? '';
  const { user } = useAuth();
  // Mesmas permissões dos itens do menu (panel-nav.ts): desmarcado no perfil, some daqui também.
  const can = (resource: string) => user?.hasPerm?.(resource) ?? false;
  const topActions: PanelTopAction[] = [
    ...(can('painel_tela_inicial') ? [{ title: 'Tela inicial', href: '/', icon: Home }] : []),
    ...(can('default')
      ? [{ title: 'Painel', href: '/painel', icon: LayoutGrid, isActive: pathname === '/painel' }]
      : []),
    ...(can('painel_minha_conta')
      ? [
          {
            title: 'Minha conta',
            href: '/painel/minha-conta',
            icon: UserCircle,
            isActive: pathname.startsWith('/painel/minha-conta'),
          },
        ]
      : []),
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
