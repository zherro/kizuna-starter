import { NextRequest, NextResponse } from 'next/server';

type IBGECity = {
  id: number;
  nome: string;
};

export async function GET(request: NextRequest) {
  const uf = request.nextUrl.searchParams.get('uf')?.trim().toUpperCase() ?? '';

  if (!uf || uf === 'ALL') {
    return NextResponse.json({ items: [] });
  }

  try {
    const response = await fetch(
      `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`,
      {
        cache: 'no-store',
      }
    );

    if (!response.ok) {
      return NextResponse.json(
        { items: [], message: 'Nao foi possivel carregar as cidades.' },
        { status: 502 }
      );
    }

    const data = (await response.json().catch(() => [])) as IBGECity[];

    return NextResponse.json({
      items: Array.isArray(data)
        ? data.map((city) => ({ value: String(city.id), label: city.nome }))
        : [],
    });
  } catch {
    return NextResponse.json(
      { items: [], message: 'Nao foi possivel carregar as cidades.' },
      { status: 500 }
    );
  }
}
