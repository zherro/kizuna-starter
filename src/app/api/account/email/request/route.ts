import { createEmailVerifyRequestHandler, pgrstRpc } from '@kizuna/core/server';
import cfg from '@/../kizuna.config.json';

// Envia o código de verificação para o e-mail da conta logada (Minha conta → Contato).
export const POST = createEmailVerifyRequestHandler(pgrstRpc, {
  siteName: (cfg as { site?: { name?: string } }).site?.name,
});
