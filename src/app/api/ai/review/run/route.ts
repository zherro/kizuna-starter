import { NextResponse } from 'next/server';
import {
  ReviewCategoryDisabledError,
  ReviewRunConflictError,
  startReviewRun,
} from '@kizuna/core/server/ai';
import { jsonError, requireAiRoot } from '@/lib/server/ai-gate';

export const runtime = 'nodejs';

/**
 * Cria o run (valida a categoria, seleciona os anúncios e grava total + ids) e devolve o runId.
 * Não processa nada: a tela chama `POST /api/ai/review/runs/[id]/step` em seguida, em loop.
 */
export async function POST(request: Request) {
  const gate = await requireAiRoot();
  if (gate.error) return gate.error;
  const body = (await request.json().catch(() => null)) as {
    categoryId?: number;
    limit?: number;
    includeReviewed?: boolean;
  } | null;
  const categoryId = Number(body?.categoryId);
  const limit = Math.floor(Number(body?.limit));
  if (!Number.isInteger(categoryId) || categoryId <= 0) {
    return NextResponse.json({ message: 'Categoria inválida.' }, { status: 400 });
  }
  if (!Number.isFinite(limit) || limit < 1) {
    return NextResponse.json({ message: 'Quantidade inválida.' }, { status: 400 });
  }
  try {
    const result = await startReviewRun(gate.db, {
      categoryId,
      limit,
      includeReviewed: Boolean(body?.includeReviewed),
      userId: gate.session.user_id,
    });
    return NextResponse.json(
      { runId: result.runId, status: result.status, total: result.total },
      { status: 201 }
    );
  } catch (e) {
    if (e instanceof ReviewCategoryDisabledError) {
      return NextResponse.json({ message: e.message }, { status: 400 });
    }
    if (e instanceof ReviewRunConflictError) {
      return NextResponse.json({ message: e.message, runId: e.runId }, { status: 409 });
    }
    return jsonError(e);
  }
}
