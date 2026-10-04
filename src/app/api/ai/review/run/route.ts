import { NextResponse } from 'next/server';
import { ReviewRunConflictError, runReviewBatch } from '@kizuna/core/server/ai';
import { serviceTable } from '@kizuna/core/server';
import { jsonError, requireAiAccess } from '@/lib/server/ai-gate';

// Node (não edge): o processamento segue em segundo plano após a resposta. O projeto roda
// standalone (Docker), então o processo permanece vivo; em serverless puro isso não valeria.
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const gate = await requireAiAccess('review');
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
    const cat = await serviceTable(`/categories?id=eq.${categoryId}&select=id,ai_review&limit=1`);
    const rows = cat.ok ? ((await cat.json()) as Array<{ ai_review?: boolean }>) : [];
    if (rows[0]?.ai_review !== true) {
      return NextResponse.json(
        { message: 'A categoria não está habilitada para revisão por IA.' },
        { status: 400 }
      );
    }
    const result = await runReviewBatch({
      categoryId,
      limit,
      includeReviewed: Boolean(body?.includeReviewed),
      userId: gate.session.user_id,
      background: true,
    });
    return NextResponse.json(
      { runId: result.runId, status: result.status, total: result.total },
      { status: 202 }
    );
  } catch (e) {
    if (e instanceof ReviewRunConflictError) {
      return NextResponse.json({ message: e.message, runId: e.runId }, { status: 409 });
    }
    return jsonError(e);
  }
}
