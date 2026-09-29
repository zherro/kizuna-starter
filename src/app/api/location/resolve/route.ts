import { NextRequest, NextResponse } from 'next/server';
import { parseLocationConfig, resolveLocation } from '@kizuna/core/server';
import cfg from '@/../kizuna.config.json';

/**
 * Valida uma localização detectada (GPS/IP) ou salva no navegador contra a lista de cidades do
 * projeto e aplica `location.outsideList` do kizuna.config.json.
 * `GET ?uf=MT&city=Cuiabá` → `{ location: { stateCode, stateName, cityId, cityName } | null }`.
 * `location: null` = sem cidade válida — o cliente abre o seletor.
 */

const config = parseLocationConfig((cfg as { location?: unknown }).location);

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  try {
    const location = await resolveLocation(config, {
      uf: params.get('uf'),
      city: params.get('city'),
    });
    return NextResponse.json(
      { location },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
        },
      }
    );
  } catch {
    return NextResponse.json(
      { location: null, message: 'Nao foi possivel validar a localizacao.' },
      { status: 502 }
    );
  }
}
