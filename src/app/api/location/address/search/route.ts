import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q');

  if (!query) {
    return NextResponse.json({ error: 'Query obrigatória' }, { status: 400 });
  }

  const apiKey = process.env.GOOGLE_MAPS_SERVER_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: 'Google Maps não configurado' }, { status: 500 });
  }

  const url = new URL('https://places.googleapis.com/v1/places:searchText');

  const response = await fetch(url, {
    method: 'POST',

    headers: {
      'Content-Type': 'application/json',

      'X-Goog-Api-Key': apiKey,

      'X-Goog-FieldMask':
        'places.id,places.displayName,places.formattedAddress,places.location,places.addressComponents',
    },

    body: JSON.stringify({
      textQuery: query,

      languageCode: 'pt-BR',

      regionCode: 'BR',
    }),
  });

  if (!response.ok) {
    const error = await response.text();

    console.error('Google Places:', error);

    return NextResponse.json(
      {
        error: 'Erro ao consultar localização',
      },
      {
        status: 502,
      }
    );
  }

  const data = await response.json();

  return NextResponse.json(data);
}
