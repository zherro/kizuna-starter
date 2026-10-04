import { NextResponse } from 'next/server';
import { getActiveReviewRun } from '@kizuna/core/server/ai';
import { jsonError, requireAiRoot } from '@/lib/server/ai-gate';

export const runtime = 'nodejs';

/** Run em andamento (para a tela retomar ao reabrir), ou `{ run: null }`. */
export async function GET() {
  const gate = await requireAiRoot();
  if (gate.error) return gate.error;
  try {
    return NextResponse.json({ run: await getActiveReviewRun(gate.db) });
  } catch (e) {
    return jsonError(e);
  }
}
