import { redirect } from 'next/navigation';
import { getSession } from '@kizuna/core/server';
import { AuthProvider } from '@kizuna/core/client/providers/auth-provider';
import { PanelShell } from '@/components/panel-shell';

// EXEMPLO — a área /painel É logada: aqui SIM lemos a sessão no servidor
// (`getSession`) e passamos para o `AuthProvider` deste subtree. O layout raiz
// não faz isso de propósito (páginas públicas estáticas — ver HARDENING.md), então
// sem este AuthProvider aninhado o `PanelShell` renderiza com `user=null` no F5 e
// o gate de permissão manda pra notFound().
export default async function PainelLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();
  if (!session) {
    redirect('/login');
  }

  const initialUser = {
    user_id: session.user_id,
    display_name: session.display_name,
    login: session.login,
    tenant_type: session.tenant_type,
    perms: session.perms,
    is_root: session.is_root,
  };

  return (
    <AuthProvider initialUser={initialUser}>
      <PanelShell>{children}</PanelShell>
    </AuthProvider>
  );
}
