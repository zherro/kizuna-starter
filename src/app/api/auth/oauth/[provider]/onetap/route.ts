import { createOAuthOneTapHandlers, pgrstRpc, pgrstTable } from '@kizuna/core/server';

export const runtime = 'nodejs';

// Google One Tap: GET entrega clientId + nonce; POST recebe o id_token e abre a sessão.
export const { GET, POST } = createOAuthOneTapHandlers(pgrstRpc, { pgrstTable });
