import { RegisterPageContent } from '@kizuna/core/client/components/register-page';
import { AuthSplit } from '@/components/auth-split';
import { RegisterAside } from '@/components/register-aside';

export default function RegisterPage() {
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
