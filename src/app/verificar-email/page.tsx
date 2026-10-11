import type { Metadata } from 'next';
import { EmailVerificationLinkPage } from '@kizuna/core/client/components/onboarding/email-verification-link-page';

export const metadata: Metadata = { title: 'Confirmar e-mail', robots: { index: false } };

// Abre o link "Confirmar meu e-mail" (#t=<código criptografado>). Pública de propósito: sem login,
// a página manda para /login e volta aqui sem perder o código.
export default function VerificarEmailLinkPage() {
  return <EmailVerificationLinkPage />;
}
