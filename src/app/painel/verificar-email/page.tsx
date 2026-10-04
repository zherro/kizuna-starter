import { redirect } from 'next/navigation';
import { getSession } from '@kizuna/core/server';
import { EmailVerificationPage } from '@kizuna/core/client/components/onboarding/email-verification-page';

// Verificação do e-mail da conta (link "Verificar meu e-mail" em Minha conta). Exige login.
export default async function VerificarEmailPage() {
  const session = await getSession();
  if (!session) redirect('/login?returnTo=/painel/verificar-email');
  return <EmailVerificationPage userEmail={session.login} />;
}
