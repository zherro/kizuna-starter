import { NextResponse } from 'next/server';
import { verifyCaptcha } from '@kizuna/core/server/captcha';
import {
  PASS_COOKIE_NAME,
  PASS_TTL_MS,
  clientIp,
  cookieSecret,
  signPass,
} from '@/lib/server/eleicao-rate-limit';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { captchaToken?: unknown };
  const token = typeof body.captchaToken === 'string' ? body.captchaToken : null;

  const result = await verifyCaptcha(token, clientIp(request.headers));
  if (!result.ok) {
    return NextResponse.json({ error: 'captcha_invalid' }, { status: 400 });
  }
  const secret = cookieSecret();
  if (!secret) return NextResponse.json({ error: 'config' }, { status: 500 });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(PASS_COOKIE_NAME, signPass(secret), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: PASS_TTL_MS / 1000,
  });
  return res;
}
