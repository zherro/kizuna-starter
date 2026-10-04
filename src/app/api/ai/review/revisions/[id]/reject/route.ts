import { NextResponse } from 'next/server';
import { pgrstRpc } from '@kizuna/core/server';
import { jsonError, requireAiAccess } from '@/lib/server/ai-gate';

export const runtime = 'nodejs';

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAiAccess('review');
  if (gate.error) return gate.error;
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ message: 'id inválido.' }, { status: 400 });
  }
  try {
    const res = await pgrstRpc('fn_service_revision_reject', { p_revision_id: id });
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
