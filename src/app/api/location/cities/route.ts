import { NextRequest, NextResponse } from 'next/server';
import { listLocationCities, parseLocationConfig } from '@kizuna/core/server';
import cfg from '@/../kizuna.config.json';

/**
 * Municípios de uma UF. Fonte = `location.source` do kizuna.config.json: IBGE (proxy com cache)
 * ou banco (`location_city` — só as cidades atendidas).
 * Resposta: `{ items: { value: string; label: string }[] }` (código IBGE como `value`).
 */

const config = parseLocationConfig((cfg as { location?: unknown }).location);

const CACHE_CONTROL =
  config.source === 'db'
    ? 'public, s-maxage=300, stale-while-revalidate=60'
    : 'public, s-maxage=604800, stale-while-revalidate=86400';

export async function GET(request: NextRequest) {
  const uf = request.nextUrl.searchParams.get('uf') ?? '';
  try {
    const items = await listLocationCities(config, uf);
    return NextResponse.json({ items }, { headers: { 'Cache-Control': CACHE_CONTROL } });
  } catch {
    return NextResponse.json(
      { items: [], message: 'Nao foi possivel carregar as cidades.' },
      { status: 502 }
    );
  }
}
