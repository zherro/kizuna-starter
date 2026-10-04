import { NextResponse } from 'next/server';
import { getSession, getTokenFromCookies, type SessionPayload } from '@kizuna/core/server';
import { canAccessAiReview, type AiUserDb } from '@kizuna/core/server/ai';

/**
 * Gate das rotas /api/ai/*: somente root. Devolve também o `db` (JWT da sessão) que as funções de
 * IA usam para falar com o PostgREST — nunca o token de serviço.
 */
export async function requireAiRoot(): Promise<
  { session: SessionPayload; db: AiUserDb; error: null } | { session: null; db: null; error: NextResponse }
> {
  const [session, accessToken] = await Promise.all([getSession(), getTokenFromCookies()]);
  if (!session || !accessToken) {
    return {
      session: null,
      db: null,
      error: NextResponse.json({ message: 'Sessão expirada.' }, { status: 401 }),
    };
  }
  if (!canAccessAiReview(session)) {
    return { session: null, db: null, error: NextResponse.json({ message: 'Acesso negado.' }, { status: 403 }) };
  }
  return { session, db: { accessToken }, error: null };
}

export function jsonError(e: unknown, status = 500) {
  const message = e instanceof Error ? e.message : 'Erro inesperado.';
  return NextResponse.json({ message }, { status });
}
