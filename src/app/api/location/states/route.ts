import { NextResponse } from 'next/server';
import { listLocationStates, parseLocationConfig } from '@kizuna/core/server';
import cfg from '@/../kizuna.config.json';

/**
 * Estados do seletor de local. Fonte = `location.source` do kizuna.config.json: IBGE (Brasil
 * inteiro, proxy com cache) ou banco (`location_state` — só o que o projeto cadastrou).
 * Resposta: `{ items: { id: number; sigla: string; nome: string }[] }` ordenado por nome.
 */

const config = parseLocationConfig((cfg as { location?: unknown }).location);

// IBGE: UFs praticamente nunca mudam. Banco: curto, para um INSERT novo aparecer logo.
const CACHE_CONTROL =
  config.source === 'db'
    ? 'public, s-maxage=300, stale-while-revalidate=60'
    : 'public, s-maxage=604800, stale-while-revalidate=86400';

export async function GET() {
  try {
    const items = await listLocationStates(config);
    return NextResponse.json({ items }, { headers: { 'Cache-Control': CACHE_CONTROL } });
  } catch {
    return NextResponse.json(
      { items: [], message: 'Nao foi possivel carregar os estados.' },
      { status: 502 }
    );
  }
}
