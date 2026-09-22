import { NextRequest, NextResponse } from 'next/server';

type NominatimReverseResponse = {
  address?: {
    postcode?: string;
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    'ISO3166-2-lvl4'?: string;
  };
};

const STATE_TO_UF: Record<string, string> = {
  Acre: 'AC',
  Alagoas: 'AL',
  Amapá: 'AP',
  Amazonas: 'AM',
  Bahia: 'BA',
  Ceará: 'CE',
  'Distrito Federal': 'DF',
  'Espírito Santo': 'ES',
  Goiás: 'GO',
  Maranhão: 'MA',
  'Mato Grosso': 'MT',
  'Mato Grosso do Sul': 'MS',
  'Minas Gerais': 'MG',
  Pará: 'PA',
  Paraíba: 'PB',
  Paraná: 'PR',
  Pernambuco: 'PE',
  Piauí: 'PI',
  'Rio de Janeiro': 'RJ',
  'Rio Grande do Norte': 'RN',
  'Rio Grande do Sul': 'RS',
  Rondônia: 'RO',
  Roraima: 'RR',
  'Santa Catarina': 'SC',
  'São Paulo': 'SP',
  Sergipe: 'SE',
  Tocantins: 'TO',
};

function normalizeLatLng(value: string) {
  const normalized = String(value ?? '')
    .trim()
    .replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeCep(value: string) {
  return String(value ?? '')
    .replace(/\D/g, '')
    .slice(0, 8);
}

export async function GET(request: NextRequest) {
  const latitude = normalizeLatLng(request.nextUrl.searchParams.get('lat') ?? '');
  const longitude = normalizeLatLng(request.nextUrl.searchParams.get('lng') ?? '');

  if (latitude === null || longitude === null) {
    return NextResponse.json({ message: 'Latitude e longitude invalidas.' }, { status: 400 });
  }

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=pt-BR`,
      {
        cache: 'no-store',
        headers: {
          'User-Agent': 'foco-total-location/1.0',
        },
      }
    );

    if (!response.ok) {
      return NextResponse.json(
        { message: 'Nao foi possivel consultar a localizacao.' },
        { status: 502 }
      );
    }

    const data = (await response.json().catch(() => null)) as NominatimReverseResponse | null;
    const address = data?.address ?? {};
    const city = address.city ?? address.town ?? address.village ?? '';
    const stateName = address.state ?? '';
    const uf = (
      address['ISO3166-2-lvl4']?.replace('BR-', '') ??
      STATE_TO_UF[stateName] ??
      ''
    ).toUpperCase();
    const zipCode = normalizeCep(address.postcode ?? '');

    if (!city || !uf) {
      return NextResponse.json(
        { message: 'Nao foi possivel identificar cidade e estado.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      zipCode,
      city,
      state: uf,
      stateName,
      latitude: String(latitude),
      longitude: String(longitude),
    });
  } catch {
    return NextResponse.json(
      { message: 'Nao foi possivel consultar a localizacao.' },
      { status: 500 }
    );
  }
}
