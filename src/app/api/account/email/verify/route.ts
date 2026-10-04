import { createEmailVerifyConfirmHandler, pgrstRpc } from '@kizuna/core/server';

// Confere o código e marca auth.users.email_verified_at (nível "contato verificado").
export const POST = createEmailVerifyConfirmHandler(pgrstRpc);
