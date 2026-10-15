import { NextRequest, NextResponse } from 'next/server';
import { searchAddress } from '@kizuna/core/server';

/**
 * Busca de endereço/lugar do formulário de endereço. Google Places com `GOOGLE_MAPS_SERVER_KEY`;
 * sem a chave (ou com o Google falhando) usa o OpenStreetMap (Photon) no mesmo formato.
 */
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')?.trim();
  if (!query) {
    return NextResponse.json({ error: 'Query obrigatória' }, { status: 400 });
  }

  try {
    const data = await searchAddress(query, { googleKey: process.env.GOOGLE_MAPS_SERVER_KEY });
    return NextResponse.json(data);
  } catch (e) {
    console.error('Busca de endereço:', (e as Error).message);
    return NextResponse.json({ error: 'Erro ao consultar localização' }, { status: 502 });
  }
}
