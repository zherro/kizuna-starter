import { NextResponse } from 'next/server';
import { aiRpc } from '@kizuna/core/server/ai';
import { jsonError, requireAiRoot } from '@kizuna/core/server/ai/gate';

export const runtime = 'nodejs';

/** Aplica a revisão com o JWT do usuário (a RPC exige root). */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAiRoot();
  if (gate.error) return gate.error;
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ message: 'id inválido.' }, { status: 400 });
  }
  const body = (await request.json().catch(() => null)) as { text?: string } | null;
  const text = typeof body?.text === 'string' ? body.text : null;
  try {
    const res = await aiRpc(gate.db, 'fn_service_revision_apply', { p_revision_id: id, p_text: text });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return NextResponse.json(
        { message: (data as { message?: string } | null)?.message ?? 'Falha ao aplicar.' },
        { status: res.status }
      );
    }
    return NextResponse.json({ ok: true, item: data });
  } catch (e) {
    return jsonError(e);
  }
}
