import { getAuthHeaderFromCookies, getSession } from '@kizuna/core/server';
import { getStorageService } from '@kizuna/core/server';

export const runtime = 'nodejs';

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return new Response('Sessao expirada. Faca login novamente.', { status: 401 });
  }

  const authHeader = await getAuthHeaderFromCookies();
  if (!authHeader) {
    return new Response('Nao foi possivel validar sua sessao.', { status: 401 });
  }

  const { id } = await params;

  const service = getStorageService();
  const found = await service.getFileContent({
    authHeader,
    id,
    activeOnly: true,
  });

  if (!found) {
    return new Response('Arquivo nao encontrado.', { status: 404 });
  }

  const content: any = found.content;
  return new Response(content, {
    status: 200,
    headers: {
      'Content-Type': found.mimeType,
      'Content-Disposition': `inline; filename="${found.originalName.replace(/"/g, '')}"`,
      'Cache-Control': 'private, max-age=60',
    },
  });
}
