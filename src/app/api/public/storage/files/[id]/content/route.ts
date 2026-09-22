import { pgrstTable } from '@kizuna/core/server';

export const runtime = 'nodejs';

type Params = {
  params: Promise<{ id: string }>;
};

type FileRow = {
  id: string;
  original_name: string;
  mime_type: string | null;
  content: string | null; // bytea como hex (\xABCD...)
  active: boolean;
};

function fromPgBytea(value: unknown): Buffer | null {
  if (typeof value !== 'string' || !value.startsWith('\\x')) return null;
  const hex = value.slice(2);
  if (!hex || hex.length % 2 !== 0) return null;
  return Buffer.from(hex, 'hex');
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;

  // `files.id` is a uuid (see kizuna-core/plugins/storage/0001_storage.sql), not a numeric id.
  const cleanId = String(id ?? '').trim();
  if (!UUID_RE.test(cleanId)) {
    return new Response('ID inválido.', { status: 400 });
  }

  const response = await pgrstTable(
    `/files?select=id,original_name,mime_type,content,active&id=eq.${cleanId}&active=eq.true&limit=1`,
    // `public.files` — PostgREST's default schema is `auth`, so this must be explicit or the
    // query resolves against `auth.files` (which doesn't exist) and 404s every time. `pgrstTable`
    // (unlike `pgrstRpc`) has no `opts.schema` — it must go through `init.headers` directly, same
    // as every other `pgrstTable` caller touching a non-default schema (see storage-service.ts).
    { headers: { 'Accept-Profile': 'public' } },
    { auth: null }
  );

  if (!response.ok) {
    return new Response('Arquivo não encontrado.', { status: 404 });
  }

  const rows = (await response.json().catch(() => [])) as FileRow[];
  const found = rows[0];
  if (!found) {
    return new Response('Arquivo não encontrado.', { status: 404 });
  }

  const content = fromPgBytea(found.content);
  if (!content) {
    return new Response('Conteúdo do arquivo indisponível.', { status: 404 });
  }

  const mimeType = found.mime_type ?? 'application/octet-stream';
  const safeName = (found.original_name ?? `file-${cleanId}`).replace(/"/g, '');

  return new Response(new Blob([new Uint8Array(content)]), {
    status: 200,
    headers: {
      'Content-Type': mimeType,
      'Content-Disposition': `inline; filename="${safeName}"`,
      'Cache-Control': 'public, max-age=3600, immutable',
    },
  });
}
