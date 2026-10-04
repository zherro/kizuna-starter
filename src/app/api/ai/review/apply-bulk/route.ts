import { NextResponse } from 'next/server';
import { pgrstRpc } from '@kizuna/core/server';
import { requireAiAccess } from '@/lib/server/ai-gate';

export const runtime = 'nodejs';

/** Aplica várias revisões (texto da IA, sem edição). Devolve o resultado por id. */
export async function POST(request: Request) {
  const gate = await requireAiAccess('review');
  if (gate.error) return gate.error;
  const body = (await request.json().catch(() => null)) as { ids?: unknown[] } | null;
  const ids = (Array.isArray(body?.ids) ? body.ids : [])
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, 200);
  if (ids.length === 0) {
    return NextResponse.json({ message: 'Nenhuma revisão informada.' }, { status: 400 });
  }

  const results: Array<{ id: number; ok: boolean; message?: string }> = [];
  for (const id of ids) {
    try {
      const res = await pgrstRpc('fn_service_revision_apply', { p_revision_id: id, p_text: null });
      if (res.ok) results.push({ id, ok: true });
      else {
        const d = (await res.json().catch(() => null)) as { message?: string } | null;
        results.push({ id, ok: false, message: d?.message ?? `Erro ${res.status}` });
      }
    } catch (e) {
      results.push({ id, ok: false, message: e instanceof Error ? e.message : 'Erro' });
    }
  }
  return NextResponse.json({
    applied: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
}
