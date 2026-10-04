import { randomInt } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getAuthHeaderFromCookies, getSession, maskEmail } from '@kizuna/core/server';
import { sendEmail } from '@kizuna/core/server/email';
import cfg from '@/../kizuna.config.json';

export const runtime = 'nodejs';

const POSTGREST_URL = process.env.POSTGREST_URL || 'http://127.0.0.1:3000';
const siteName = (cfg as { site?: { name?: string } }).site?.name ?? 'nosso site';

// Gera o código de 6 dígitos, grava em user_data.email_verification_code (conferido pelo
// verify-code ao lado) e envia para o e-mail da conta.
export async function POST() {
  const session = await getSession();
  if (!session?.login) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const auth = await getAuthHeaderFromCookies();

  const saved = await fetch(`${POSTGREST_URL}/user_data?on_conflict=user_id`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
      ...(auth ? { Authorization: auth } : {}),
    },
    body: JSON.stringify({ user_id: session.user_id, email_verification_code: code }),
  });
  if (!saved.ok) {
    console.error('[email.request-code] save_failed', saved.status, await saved.text());
    return NextResponse.json({ error: 'Nao foi possivel gerar o codigo.' }, { status: 500 });
  }

  try {
    await sendEmail({
      to: session.login,
      template: {
        subject: `${code} é o seu código de verificação — ${siteName}`,
        text: `Seu código para confirmar o e-mail no ${siteName} é ${code}.`,
        html: `<p>Seu código para confirmar o e-mail no <strong>${siteName}</strong> é:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p>`,
      },
    });
  } catch (error) {
    console.error('[email.request-code] send_failed', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Nao foi possivel enviar o e-mail agora.' }, { status: 503 });
  }

  return NextResponse.json({ message: `Enviamos um código para ${maskEmail(session.login)}.` });
}
