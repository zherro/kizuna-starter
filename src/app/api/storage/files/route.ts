import { NextResponse } from 'next/server';
import { getAuthHeaderFromCookies, getSession } from '@kizuna/core/server';
import { getStorageService } from '@kizuna/core/server';

export const runtime = 'nodejs';

const DEFAULT_MAX_FILE_SIZE_MB = 5;

function toPositiveNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function parseBoolean(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
    if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  }
  return fallback;
}

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

export async function GET(request: Request) {
  const auth = await ensureAuth();
  if (!auth.authHeader) {
    return auth.error ?? NextResponse.json({ message: 'Nao autorizado.' }, { status: 401 });
  }

  const url = new URL(request.url);
  const ids = (url.searchParams.get('ids') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  const purpose = (url.searchParams.get('purpose') ?? '').trim() || undefined;
  const activeParam = (url.searchParams.get('active') ?? '').trim();
  const active = activeParam.length > 0 ? parseBoolean(activeParam, true) : undefined;

  const limit = Math.floor(toPositiveNumber(url.searchParams.get('limit'), 100));

  try {
    const service = getStorageService();
    const items = await service.listFiles({
      authHeader: auth.authHeader,
      ids,
      purpose,
      active,
      limit,
    });

    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ message: 'Nao foi possivel listar os arquivos.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await ensureAuth();
  if (!auth.authHeader) {
    return auth.error ?? NextResponse.json({ message: 'Nao autorizado.' }, { status: 401 });
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ message: 'Payload de upload invalido.' }, { status: 400 });
  }

  const purpose = String(formData.get('purpose') ?? 'ad_image').trim() || 'ad_image';
  const optimizeImages = parseBoolean(formData.get('optimizeImages'), true);
  const maxFileSizeMb = toPositiveNumber(formData.get('maxFileSizeMb'), DEFAULT_MAX_FILE_SIZE_MB);
  const maxFileSizeBytes = Math.floor(maxFileSizeMb * 1024 * 1024);

  const fileParts = formData.getAll('files').filter((item): item is File => item instanceof File);

  if (fileParts.length === 0) {
    return NextResponse.json({ message: 'Nenhum arquivo enviado.' }, { status: 400 });
  }

  try {
    const service = getStorageService();
    const result = await service.uploadFiles({
      authHeader: auth.authHeader,
      files: fileParts.map((file) => ({
        file,
        purpose,
        optimizeImages,
        maxFileSizeBytes,
      })),
    });

    if (result.uploaded.length === 0 && result.errors.length > 0) {
      return NextResponse.json(
        { message: 'Falha ao enviar arquivos.', uploaded: [], errors: result.errors },
        { status: 400 }
      );
    }

    return NextResponse.json({
      message: result.errors.length > 0 ? 'Upload parcial concluido.' : 'Upload concluido.',
      uploaded: result.uploaded,
      errors: result.errors,
    });
  } catch {
    return NextResponse.json({ message: 'Nao foi possivel processar upload.' }, { status: 500 });
  }
}
