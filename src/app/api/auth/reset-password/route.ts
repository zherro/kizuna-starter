import { pgrstRpc } from '@kizuna/core/server';
import { createResetPasswordHandler } from '@kizuna/core/server/password-reset';

export const runtime = 'nodejs';

export const POST = createResetPasswordHandler(pgrstRpc);
