import { handleSearchChat } from '@kizuna/core/server';

export const runtime = 'nodejs';

/** Conversa da /busca → filtro estruturado (skill `search` do plugin `ai_assistant`). */
export const POST = handleSearchChat;
