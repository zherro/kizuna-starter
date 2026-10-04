import { NextResponse } from 'next/server';
import { serviceTable } from '@kizuna/core/server';
import { expireStaleRuns } from '@kizuna/core/server/ai';
import { jsonError, requireAiAccess } from '@/lib/server/ai-gate';

export const runtime = 'nodejs';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAiAccess('review');
  if (gate.error) return gate.error;
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ message: 'id inválido.' }, { status: 400 });
  }
  try {
    // Run preso em running (processo reiniciado) vira failed em vez de ficar rodando para sempre.
    await expireStaleRuns();
    const res = await serviceTable(
      `/ai_review_runs?id=eq.${id}&select=id,category_id,status,total,processed,failed,tokens_in,tokens_out,error,created_at,finished_at&limit=1`
    );
    const rows = res.ok ? ((await res.json()) as Array<Record<string, unknown>>) : [];
    const r = rows[0];
    if (!r) return NextResponse.json({ message: 'Execução não encontrada.' }, { status: 404 });
    return NextResponse.json({
      id: r.id,
      categoryId: r.category_id,
      status: r.status,
      total: Number(r.total ?? 0),
      processed: Number(r.processed ?? 0),
      failed: Number(r.failed ?? 0),
      tokensIn: Number(r.tokens_in ?? 0),
      tokensOut: Number(r.tokens_out ?? 0),
      error: r.error ?? null,
      createdAt: r.created_at,
      finishedAt: r.finished_at ?? null,
    });
  } catch (e) {
    return jsonError(e);
  }
}
