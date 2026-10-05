import { NextResponse } from 'next/server';
import { cancelReviewRun } from '@kizuna/core/server/ai';
import { jsonError, requireAiRoot } from '@kizuna/core/server/ai/gate';

export const runtime = 'nodejs';

/** Marca a execução como cancelada; o próximo passo já não processa nada. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAiRoot();
  if (gate.error) return gate.error;
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ message: 'id inválido.' }, { status: 400 });
  }
  try {
    if (!(await cancelReviewRun(gate.db, id))) {
      return NextResponse.json({ message: 'Execução não está em andamento.' }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
