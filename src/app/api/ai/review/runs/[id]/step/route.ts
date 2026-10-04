import { NextResponse } from 'next/server';
import { ReviewRunNotFoundError, stepReviewRun } from '@kizuna/core/server/ai';
import { jsonError, requireAiRoot } from '@/lib/server/ai-gate';

export const runtime = 'nodejs';
// Um passo (até 5 anúncios, concorrência 3) só passa de 60 s com provider muito lento.
export const maxDuration = 120;

/** Processa o próximo pedaço do run com o JWT do usuário e devolve o progresso. Idempotente. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAiRoot();
  if (gate.error) return gate.error;
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ message: 'id inválido.' }, { status: 400 });
  }
  try {
    return NextResponse.json(await stepReviewRun(gate.db, id, { userId: gate.session.user_id }));
  } catch (e) {
    if (e instanceof ReviewRunNotFoundError) {
      return NextResponse.json({ message: e.message }, { status: 404 });
    }
    return jsonError(e);
  }
}
