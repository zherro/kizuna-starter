import { NextRequest, NextResponse } from 'next/server';

/**
 * Municípios de uma UF — proxy server-side da API de localidades do IBGE, com cache.
 * Resposta: `{ items: { value: string; label: string }[] }` (id do IBGE como `value`).
 */

type IBGECity = { id: number; nome: string };

const TTL_MS = 24 * 60 * 60_000;
const cache = new Map<string, { at: number; items: Array<{ value: string; label: string }> }>();

// Municípios de uma UF mudam raríssimo — cache de CDN/proxy além do cache em memória.
const CACHE_CONTROL = 'public, s-maxage=604800, stale-while-revalidate=86400';

export async function GET(request: NextRequest) {
  const uf = request.nextUrl.searchParams.get('uf')?.trim().toUpperCase() ?? '';

  if (!uf || uf === 'ALL') {
    return NextResponse.json({ items: [] });
  }

  const cached = cache.get(uf);
  if (cached && Date.now() - cached.at < TTL_MS) {
    return NextResponse.json(
      { items: cached.items },
      { headers: { 'Cache-Control': CACHE_CONTROL } }
    );
  }

  try {
    const response = await fetch(
      `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${encodeURIComponent(uf)}/municipios?orderBy=nome`,
      { cache: 'no-store' }
    );

    if (!response.ok) {
      return NextResponse.json(
        { items: [], message: 'Nao foi possivel carregar as cidades.' },
        { status: 502 }
      );
    }

    const data = (await response.json().catch(() => [])) as IBGECity[];
    const items = Array.isArray(data)
      ? data.map((city) => ({ value: String(city.id), label: city.nome }))
      : [];
    cache.set(uf, { at: Date.now(), items });
    return NextResponse.json({ items }, { headers: { 'Cache-Control': CACHE_CONTROL } });
  } catch {
    return NextResponse.json(
      { items: [], message: 'Nao foi possivel carregar as cidades.' },
      { status: 500 }
    );
  }
}
