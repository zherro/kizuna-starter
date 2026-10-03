import { createContactHandler } from '@kizuna/core/server';

export const runtime = 'nodejs';

// Contato público (visitante sem login) — abre chamado 'contact'. Ver plugin tickets.
export const POST = createContactHandler();
