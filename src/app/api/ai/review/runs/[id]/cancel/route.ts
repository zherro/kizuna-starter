import { NextResponse } from 'next/server';
import { serviceTable } from '@kizuna/core/server';
import { jsonError, requireAiAccess } from '@/lib/server/ai-gate';

export const runtime = 'nodejs';

/** Marca a execução como cancelada; o lote para antes do próximo anúncio. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAiAccess('review');
  if (gate.error) return gate.error;
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ message: 'id inválido.' }, { status: 400 });
  }
  try {
    const res = await serviceTable(`/ai_review_runs?id=eq.${id}&status=eq.running`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ status: 'cancelled' }),
    });
    const rows = res.ok ? ((await res.json().catch(() => [])) as unknown[]) : [];
    if (!res.ok || rows.length === 0) {
      return NextResponse.json({ message: 'Execução não está em andamento.' }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
