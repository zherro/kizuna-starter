import { NextRequest, NextResponse } from 'next/server';

type ViaCepResponse = {
  cep?: string;
  logradouro?: string;
  complemento?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  ibge?: string;
  erro?: boolean;
};

function normalizeCep(value: string) {
  return String(value ?? '')
    .replace(/\D/g, '')
    .slice(0, 8);
}

export async function GET(request: NextRequest) {
  const cep = normalizeCep(request.nextUrl.searchParams.get('cep') ?? '');

  if (cep.length !== 8) {
    return NextResponse.json({ message: 'CEP invalido.' }, { status: 400 });
  }

  try {
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
      cache: 'no-store',
    });

    if (!response.ok) {
      return NextResponse.json(
        { message: 'Nao foi possivel consultar o CEP agora.' },
        { status: 502 }
      );
    }

    const data = (await response.json().catch(() => null)) as ViaCepResponse | null;

    if (!data || data.erro) {
      return NextResponse.json({ message: 'CEP nao encontrado.' }, { status: 404 });
    }

    return NextResponse.json({
      cep: data.cep ?? cep,
      city: data.localidade ?? '',
      state: String(data.uf ?? '').toUpperCase(),
      street: data.logradouro ?? '',
      neighborhood: data.bairro ?? '',
      ibge: data.ibge ?? '',
    });
  } catch {
    return NextResponse.json(
      { message: 'Nao foi possivel consultar o CEP agora.' },
      { status: 500 }
    );
  }
}
