import { NextResponse } from 'next/server';
import { getSession, hasServiceAccess, isValidEmail, serviceTable } from '@kizuna/core/server';
import {
  buildReturnUrl,
  getAtlasSsoSecret,
  isEmailVerifiedInAuthUsers,
  isValidState,
  matchAllowedReturn,
  parseAllowedReturns,
  signAtlasToken,
} from '@/lib/server/atlas-sso';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store, private', Pragma: 'no-cache', 'Referrer-Policy': 'no-referrer' };

function plain(message: string, status: number) {
  return new NextResponse(message, {
    status,
    headers: { ...NO_STORE, 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

/**
 * O e-mail só conta como verificado se `auth.users.email_verified_at` (lido AQUI, no servidor,
 * como service_role) estiver preenchido. NÃO usa `fun_auth__account_facts`: ela faz
 * `email_verified_at OR user_data.email_verified`, e `user_data` é gravável pelo próprio usuário.
 * Sem POSTGREST_SERVICE_TOKEN, falha ou linha estranha => false (o Atlas então não vincula).
 */
async function isEmailVerified(userId: string, email: string): Promise<boolean> {
  if (!hasServiceAccess() || !/^[0-9a-f-]{36}$/i.test(userId)) return false;
  try {
    const res = await serviceTable(
      `/users?uid=eq.${encodeURIComponent(userId)}&select=login,email_verified_at,is_active,deleted_at&limit=1`,
      { schema: 'auth' }
    );
    if (!res.ok) return false;
    const rows = (await res.json().catch(() => null)) as unknown;
    return isEmailVerifiedInAuthUsers(Array.isArray(rows) ? rows[0] : null, email);
  } catch {
    return false;
  }
}

/**
 * GET /api/auth/atlas-sso?state=...&return=...
 * "Entrar com Bora Cuiabá" para o Atlas. Exige sessão do Bora; emite token de 60 s e volta
 * para o `return` (allowlist exata em ATLAS_SSO_ALLOWED_RETURNS). Ver docs/integracoes/atlas-sso.md.
 */
export async function GET(request: Request) {
  const secret = getAtlasSsoSecret();
  const allowed = parseAllowedReturns(process.env.ATLAS_SSO_ALLOWED_RETURNS);
  if (!secret || allowed.length === 0) return plain('Entrar com Bora Cuiabá não está configurado.', 503);

  const url = new URL(request.url);
  const returnUrl = matchAllowedReturn(url.searchParams.get('return'), allowed);
  if (!returnUrl) return plain('Destino de retorno não autorizado.', 400);
  const state = url.searchParams.get('state');
  if (!isValidState(state)) return plain('Parâmetro state inválido.', 400);

  const session = await getSession();
  if (!session) {
    // Volta para esta mesma rota depois do login (o /login só aceita caminho local em returnTo).
    // Location relativo: vale atrás de qualquer proxy/domínio, sem depender de APP_URL.
    const login = new URLSearchParams({ returnTo: `${url.pathname}${url.search}` });
    return new NextResponse(null, {
      status: 302,
      headers: { ...NO_STORE, Location: `/login?${login.toString()}` },
    });
  }

  const email = (session.login ?? '').trim().toLowerCase();
  if (!isValidEmail(email)) {
    return plain(
      'Sua conta Bora Cuiabá não tem e-mail cadastrado. Use um login com e-mail para entrar no Atlas.',
      400
    );
  }

  const token = signAtlasToken(
    {
      userId: session.user_id,
      email,
      emailVerified: await isEmailVerified(session.user_id, email),
      name: session.display_name,
    },
    secret
  );
  return NextResponse.redirect(buildReturnUrl(returnUrl, token, state), { status: 302, headers: NO_STORE });
}
