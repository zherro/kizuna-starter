import { createAnalyticsTrackHandler, getSession } from '@kizuna/core/server';
import { analyticsConfig } from '@/lib/analytics';

export const runtime = 'nodejs';

/** Usuário logado (cookie de sessão, mesmo mecanismo do resto do app); visitante ou falha → null. */
async function getViewerId(): Promise<string | null> {
  try {
    return (await getSession())?.user_id ?? null;
  } catch {
    return null;
  }
}

// Grava eventos de métrica com aparelho, região e IP. Ver plugin analytics (0003).
export const POST = createAnalyticsTrackHandler({ config: analyticsConfig, getViewerId });
