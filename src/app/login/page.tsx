import { redirect } from 'next/navigation';
import { getSession } from '@kizuna/core/server';
import { LoginPageContent } from '@kizuna/core/client/components/login-page';
import { AuthSplit } from '@kizuna/core/client/components/auth/auth-split';
import { LoginAside } from '@/components/login-aside';

// Usuário já logado não fica aqui: vai direto para o painel (checado no servidor, sem cache).
export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (await getSession()) redirect('/painel');

  return (
    <AuthSplit aside={<LoginAside />}>
      <LoginPageContent
        title="Como prefere continuar?"
        description="Faça login com sua conta do gmail"
        registerAs="button"
        soft
      />
    </AuthSplit>
  );
}
