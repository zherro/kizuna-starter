import { NextResponse } from 'next/server';

/**
 * UFs do Brasil — proxy server-side da API de localidades do IBGE, com cache.
 * Resposta: `{ items: { sigla: string; nome: string }[] }` ordenado por nome.
 */

type IBGEState = { sigla: string; nome: string };

const TTL_MS = 7 * 24 * 60 * 60_000;
let cache: { at: number; items: IBGEState[] } | null = null;

// UFs praticamente nunca mudam — cache de CDN/proxy agressivo além do cache em memória.
const CACHE_CONTROL = 'public, s-maxage=604800, stale-while-revalidate=86400';

export async function GET() {
  if (cache && Date.now() - cache.at < TTL_MS) {
    return NextResponse.json(
      { items: cache.items },
      { headers: { 'Cache-Control': CACHE_CONTROL } }
    );
  }

  try {
    const response = await fetch(
      'https://servicodados.ibge.gov.br/api/v1/localidades/estados?orderBy=nome',
      { cache: 'no-store' }
    );

    if (!response.ok) {
      return NextResponse.json(
        { items: [], message: 'Nao foi possivel carregar os estados.' },
        { status: 502 }
      );
    }

    const data = (await response.json().catch(() => [])) as IBGEState[];
    const items = Array.isArray(data) ? data.map((s) => ({ sigla: s.sigla, nome: s.nome })) : [];
    cache = { at: Date.now(), items };
    return NextResponse.json({ items }, { headers: { 'Cache-Control': CACHE_CONTROL } });
  } catch {
    return NextResponse.json(
      { items: [], message: 'Nao foi possivel carregar os estados.' },
      { status: 500 }
    );
  }
}
