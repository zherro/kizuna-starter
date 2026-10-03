import { redirect } from 'next/navigation';
import { getSession } from '@kizuna/core/server';
import { RegisterPageContent } from '@kizuna/core/client/components/register-page';
import { AuthSplit } from '@/components/auth-split';
import { RegisterAside } from '@/components/register-aside';

// Usuário já logado não fica aqui: vai direto para o painel (checado no servidor, sem cache).
export const dynamic = 'force-dynamic';

export default async function RegisterPage() {
  if (await getSession()) redirect('/painel');

  return (
    <AuthSplit aside={<RegisterAside />}>
      <RegisterPageContent
        title="Como prefere se cadastrar?"
        description="Cadastre-se com sua conta do gmail"
        soft
      />
    </AuthSplit>
  );
}
