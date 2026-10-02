import { createDeleteAccountHandler } from '@kizuna/core/server';

export const runtime = 'nodejs';

// "Excluir minha conta" (Minha conta). Ver kizuna-core/docs/arquitetura/auth.md.
export const POST = createDeleteAccountHandler();
