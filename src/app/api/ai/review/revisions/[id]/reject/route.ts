import { NextResponse } from 'next/server';
import { aiRpc } from '@kizuna/core/server/ai';
import { jsonError, requireAiRoot } from '@kizuna/core/server/ai/gate';

export const runtime = 'nodejs';

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAiRoot();
  if (gate.error) return gate.error;
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ message: 'id inválido.' }, { status: 400 });
  }
  try {
    const res = await aiRpc(gate.db, 'fn_service_revision_reject', { p_revision_id: id });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return NextResponse.json(
        { message: (data as { message?: string } | null)?.message ?? 'Falha ao rejeitar.' },
        { status: res.status }
      );
    }
    return NextResponse.json({ ok: true, item: data });
  } catch (e) {
    return jsonError(e);
  }
}
