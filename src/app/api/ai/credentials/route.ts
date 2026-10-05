import { NextResponse } from 'next/server';
import { aiTable, AiUnavailableError, saveProviderKey, type AiProviderId } from '@kizuna/core/server/ai';
import { jsonError, requireAiRoot } from '@kizuna/core/server/ai/gate';

export const runtime = 'nodejs';

const ALLOWED: AiProviderId[] = ['gemini', 'claude'];

/** Lista credenciais SEM a chave (só os 4 últimos dígitos). */
export async function GET() {
  const gate = await requireAiRoot();
  if (gate.error) return gate.error;
  try {
    const res = await aiTable(
      gate.db,
      '/ai_credentials?select=id,provider,label,key_last4,active,created_at,updated_at&order=created_at.desc'
    );
    if (!res.ok) return NextResponse.json({ message: 'Falha ao listar credenciais.' }, { status: 502 });
    const rows = (await res.json()) as Array<Record<string, unknown>>;
    return NextResponse.json({
      items: rows.map((r) => ({
        id: r.id,
        provider: r.provider,
        label: r.label ?? null,
        keyLast4: r.key_last4 ?? null,
        active: r.active === true,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    });
  } catch (e) {
    return jsonError(e);
  }
}

/** Cifra e grava a chave (desativa as anteriores do provedor). */
export async function POST(request: Request) {
  const gate = await requireAiRoot();
  if (gate.error) return gate.error;
  const body = (await request.json().catch(() => null)) as {
    provider?: string;
    label?: string;
    key?: string;
  } | null;
  const provider = String(body?.provider ?? '') as AiProviderId;
  const key = String(body?.key ?? '').trim();
  if (!ALLOWED.includes(provider)) {
    return NextResponse.json({ message: 'Provedor inválido.' }, { status: 400 });
  }
  if (key.length < 8) return NextResponse.json({ message: 'Chave inválida.' }, { status: 400 });
  try {
    const saved = await saveProviderKey(gate.db, provider, String(body?.label ?? '').trim() || provider, key);
    return NextResponse.json({ id: saved.id, last4: saved.last4 }, { status: 201 });
  } catch (e) {
    if (e instanceof AiUnavailableError) return jsonError(e, 503);
    return jsonError(e);
  }
}

/** Desativa uma credencial: `?id=` (ou corpo com id). */
export async function DELETE(request: Request) {
  const gate = await requireAiRoot();
  if (gate.error) return gate.error;
  const url = new URL(request.url);
  const body = (await request.json().catch(() => null)) as { id?: number | string } | null;
  const id = Number(url.searchParams.get('id') ?? body?.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ message: 'id inválido.' }, { status: 400 });
  }
  try {
    const res = await aiTable(gate.db, `/ai_credentials?id=eq.${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: false, updated_at: new Date().toISOString() }),
    });
    if (!res.ok) return NextResponse.json({ message: 'Falha ao desativar.' }, { status: 502 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
