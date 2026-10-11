import { createEmailCodeRequestHandler } from '@kizuna/core/server';
import cfg from '@/../kizuna.config.json';

export const runtime = 'nodejs';

// Gera o código de 6 dígitos, grava em user_data e envia o e-mail com o código + o link
// /verificar-email#t=<código criptografado>. Lógica no core (src/server/email-verification.ts).
export const POST = createEmailCodeRequestHandler({
  appName: (cfg as { site?: { name?: string } }).site?.name,
});
