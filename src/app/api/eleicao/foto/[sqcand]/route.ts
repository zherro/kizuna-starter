import { NextResponse } from 'next/server';
import { isAllowedUf, isCargo, isDeputado, isSqcand } from '@/lib/eleicao/normalize';
import { fetchFotoRemote, readFoto, readMeta } from '@/lib/server/eleicao-data';
import { clientIp, fotoLimiter } from '@/lib/server/eleicao-rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ sqcand: string }> };

const JPEG_HEADERS = {
  'Content-Type': 'image/jpeg',
  'Cache-Control': 'public, max-age=86400, immutable',
  'X-Content-Type-Options': 'nosniff',
};
const notFound = () =>
  new NextResponse(null, { status: 404, headers: { 'Cache-Control': 'public, max-age=60' } });

// GET /api/eleicao/foto/{sqcand}[?cargo=deputado-federal&uf=SP]: foto do candidato. Só dígitos no
// id (vira nome de arquivo). Sem arquivo no volume e com cargo de deputado + UF (allowlist do
// meta), faz proxy da foto no TSE. NÃO entra no limite de 5/10s nem pede captcha (é chamada por
// <img>, que não sabe lidar com isso); tem um teto próprio e generoso só contra abuso.
export async function GET(request: Request, ctx: Ctx) {
  const { sqcand } = await ctx.params;
  if (!isSqcand(sqcand)) {
    return NextResponse.json({ error: 'sqcand_invalido' }, { status: 400 });
  }
  const sp = new URL(request.url).searchParams;
  const cargo = sp.get('cargo');
  const uf = sp.get('uf');
  if (cargo !== null && !isCargo(cargo)) {
    return NextResponse.json({ error: 'cargo_invalido' }, { status: 400 });
  }
  if (uf !== null && !/^[A-Z]{2}$/.test(uf)) {
    return NextResponse.json({ error: 'uf_invalida' }, { status: 400 });
  }
  if (!fotoLimiter().hit(clientIp(request.headers))) {
    return new NextResponse(null, { status: 429, headers: { 'Cache-Control': 'no-store' } });
  }

  const foto = await readFoto(sqcand);
  if (foto) return new NextResponse(new Uint8Array(foto), { headers: JPEG_HEADERS });

  if (isDeputado(cargo) && uf) {
    const meta = await readMeta();
    if (!meta || !isAllowedUf(uf, meta.cargos[cargo]?.ufs ?? [])) {
      return NextResponse.json({ error: 'uf_invalida' }, { status: 400 });
    }
    const remote = await fetchFotoRemote(meta, cargo, uf, sqcand);
    if (remote) return new NextResponse(new Uint8Array(remote), { headers: JPEG_HEADERS });
  }
  return notFound();
}
