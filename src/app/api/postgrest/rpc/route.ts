import { NextResponse } from 'next/server';
import { getAuthHeaderFromCookies, getSession } from '@kizuna/core/server';
import { pgrstRpc } from '@kizuna/core/server';

export const runtime = 'nodejs';

type RpcRequestBody = {
  schema?: string;
  functionName?: string;
  params?: unknown;
};

function parseError(payload: unknown) {
  const json = (payload as Record<string, unknown> | null) ?? null;
  const message = (json?.message as string | undefined) ?? 'Erro ao executar funcao no PostgREST.';
  const details =
    (json?.details as string | undefined) ||
    (json?.hint as string | undefined) ||
    (json?.error as string | undefined);

  return { message, details };
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { message: 'Sessao expirada. Faca login novamente.' },
      { status: 401 }
    );
  }

  if (session.role !== 'auth_user') {
    return NextResponse.json(
      {
        message: 'Sessao sem role autorizada para operacoes protegidas.',
        details: `Role atual: ${session.role ?? 'undefined'}`,
      },
      { status: 403 }
    );
  }

  const authHeader = await getAuthHeaderFromCookies();
  if (!authHeader) {
    return NextResponse.json(
      { message: 'Nao foi possivel montar o token de autenticacao.' },
      { status: 401 }
    );
  }

  const body = ((await request.json().catch(() => null)) as RpcRequestBody | null) ?? {};
  const schema = String(body.schema ?? 'public').trim();
  const functionName = String(body.functionName ?? '').trim();
  const params = body.params ?? {};

  if (!schema) {
    return NextResponse.json({ message: 'Informe o schema.' }, { status: 400 });
  }

  if (!functionName) {
    return NextResponse.json({ message: 'Informe o nome da funcao.' }, { status: 400 });
  }

  if (!/^[a-zA-Z0-9_]+$/.test(functionName)) {
    return NextResponse.json(
      { message: 'Nome de funcao invalido. Use apenas letras, numeros e underscore.' },
      { status: 400 }
    );
  }

  const response = await pgrstRpc(functionName, params, {
    auth: authHeader,
    schema,
  });

  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    const err = parseError(payload);
    return NextResponse.json(
      {
        message: err.message,
        details: err.details,
        status: response.status,
        payload,
      },
      { status: response.status }
    );
  }

  return NextResponse.json({ status: response.status, payload }, { status: 200 });
}
