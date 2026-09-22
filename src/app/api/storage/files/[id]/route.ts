import { NextResponse } from 'next/server';
import { getAuthHeaderFromCookies, getSession } from '@kizuna/core/server';
import { getStorageService } from '@kizuna/core/server';

export const runtime = 'nodejs';

type Params = {
  params: Promise<{ id: string }>;
};

async function ensureAuth() {
  const session = await getSession();
  if (!session) {
    return {
      error: NextResponse.json(
        { message: 'Sessao expirada. Faca login novamente.' },
        { status: 401 }
      ),
      authHeader: null as string | null,
    };
  }

  const authHeader = await getAuthHeaderFromCookies();
  if (!authHeader) {
    return {
      error: NextResponse.json(
        { message: 'Nao foi possivel validar sua sessao.' },
        { status: 401 }
      ),
      authHeader: null as string | null,
    };
  }

  return { error: null, authHeader };
}

export async function DELETE(_request: Request, { params }: Params) {
  const auth = await ensureAuth();
  if (!auth.authHeader) {
    // Sempre retorna um Response, nunca null
    return auth.error ?? NextResponse.json({ message: 'Nao autorizado.' }, { status: 401 });
  }
  const { id } = await params;
  const cleanId = String(id ?? '').trim();

  // `files.id` is a uuid (see kizuna-core/plugins/storage/0001_storage.sql), not a numeric id.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId)) {
    return NextResponse.json({ message: 'ID de arquivo invalido.' }, { status: 400 });
  }

  try {
    const service = getStorageService();
    const deleted = await service.deleteFile({ authHeader: auth.authHeader, id: cleanId });

    if (!deleted) {
      return NextResponse.json(
        { message: 'Arquivo nao encontrado para remocao.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ message: 'Arquivo removido com sucesso.', id: cleanId });
  } catch {
    return NextResponse.json({ message: 'Nao foi possivel remover o arquivo.' }, { status: 500 });
  }
}
