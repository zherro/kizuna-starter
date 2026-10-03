import { LoginPageContent } from '@kizuna/core/client/components/login-page';
import { AuthSplit } from '@/components/auth-split';
import { LoginAside } from '@/components/login-aside';

export default function LoginPage() {
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
