import { NextResponse } from 'next/server';
import { getSession, type SessionPayload } from '@kizuna/core/server';
import { canAccessAiReview, type AiReviewPerm } from '@kizuna/core/server/ai';

/** Gate das rotas /api/ai/*: root ou permissão `ai_review.<perm>` (manage cobre review). */
export async function requireAiAccess(
  perm: AiReviewPerm
): Promise<{ session: SessionPayload; error: null } | { session: null; error: NextResponse }> {
  const session = await getSession();
  if (!session) {
    return { session: null, error: NextResponse.json({ message: 'Sessão expirada.' }, { status: 401 }) };
  }
  if (!canAccessAiReview(session, perm)) {
    return { session: null, error: NextResponse.json({ message: 'Acesso negado.' }, { status: 403 }) };
  }
  return { session, error: null };
}

export function jsonError(e: unknown, status = 500) {
  const message = e instanceof Error ? e.message : 'Erro inesperado.';
  return NextResponse.json({ message }, { status });
}
