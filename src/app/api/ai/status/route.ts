import { NextResponse } from 'next/server';
import { getProviderKey, listSkillContexts, readSystemConfig } from '@kizuna/core/server/ai';
import { jsonError, requireAiAccess } from '@/lib/server/ai-gate';

export const runtime = 'nodejs';

const PROVIDERS = ['gemini', 'claude'] as const;

/** Status por provedor (chave presente: banco cifrado ou env) + config global + contextos. */
export async function GET() {
  const gate = await requireAiAccess('review');
  if (gate.error) return gate.error;
  try {
    const configured: Record<string, boolean> = {};
    for (const p of PROVIDERS) {
      try {
        configured[p] = Boolean(await getProviderKey(p));
      } catch {
        configured[p] = false;
      }
    }
    const [provider, model, contexts] = await Promise.all([
      readSystemConfig<string>('ai_assistant.provider'),
      readSystemConfig<string>('ai_assistant.model'),
      readSystemConfig<Record<string, boolean>>('ai_assistant.contexts'),
    ]);
    return NextResponse.json({
      configured,
      secretKeyConfigured: Boolean(String(process.env.AI_SECRET_KEY ?? '').trim()),
      provider: provider ?? 'gemini',
      model: model ?? '',
      contexts: contexts ?? {},
      availableContexts: Array.from(new Set([...listSkillContexts(), 'text_review'])),
    });
  } catch (e) {
    return jsonError(e);
  }
}
