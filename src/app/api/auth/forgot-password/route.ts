import { pgrstRpc } from '@kizuna/core/server';
import { createForgotPasswordHandler } from '@kizuna/core/server/password-reset';

export const runtime = 'nodejs';

export const POST = createForgotPasswordHandler(pgrstRpc);
