import { NextRequest, NextResponse } from 'next/server';
import { listLocationCities } from '@kizuna/core/server';

/**
 * Cidades do seletor de local: `location_city WHERE search_city`, por nome. `?uf=MT` opcional
 * restringe a um estado. Resposta: `{ items: { value, label, stateCode }[] }` (código IBGE como
 * `value`). Cache curto para uma cidade recém-marcada aparecer logo.
 */

const CACHE_CONTROL = 'public, s-maxage=300, stale-while-revalidate=60';

export async function GET(request: NextRequest) {
  const uf = request.nextUrl.searchParams.get('uf');
  try {
    const items = await listLocationCities(uf);
    return NextResponse.json({ items }, { headers: { 'Cache-Control': CACHE_CONTROL } });
  } catch {
    return NextResponse.json(
      { items: [], message: 'Nao foi possivel carregar as cidades.' },
      { status: 502 }
    );
  }
}
