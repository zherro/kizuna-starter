import { createMeHandler } from '@kizuna/core/server';

export const runtime = 'nodejs';

// GET /api/auth/me → { user } | { user: null }. O AuthProvider chama isto para
// hidratar a sessão no cliente (o layout raiz não lê cookie — ver HARDENING.md).
export const GET = createMeHandler();
