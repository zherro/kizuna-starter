import { NextResponse } from 'next/server';
import { isCaptchaEnabled } from '@kizuna/core/server/captcha';
import { queryEleicao } from '@/lib/server/eleicao-data';
import {
  PASS_COOKIE_NAME,
  clientIp,
  cookieSecret,
  readCookie,
  sharedLimiter,
  verifyPass,
} from '@/lib/server/eleicao-rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/eleicao?cargo=presidente|governador|senador|deputado-federal|deputado-estadual&escopo=meta|nacional|uf&uf=SP
// Deputados (só escopo=uf): &q=&partido=&page=&limit=(máx 50)&eleitos=1
export async function GET(request: Request) {
  const pass = readCookie(request.headers.get('cookie'), PASS_COOKIE_NAME);
  if (!verifyPass(pass, cookieSecret()) && !sharedLimiter().hit(clientIp(request.headers))) {
    return NextResponse.json(
      { error: 'captcha_required', captcha: isCaptchaEnabled() },
      { status: 429, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const url = new URL(request.url);
  const result = await queryEleicao(
    url.searchParams.get('cargo'),
    url.searchParams.get('escopo'),
    url.searchParams.get('uf'),
    undefined,
    url.searchParams
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result.body, { headers: { 'Cache-Control': 'public, max-age=5' } });
}
