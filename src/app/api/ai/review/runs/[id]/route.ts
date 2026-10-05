import { NextResponse } from 'next/server';
import { getReviewRun, ReviewRunNotFoundError } from '@kizuna/core/server/ai';
import { jsonError, requireAiRoot } from '@kizuna/core/server/ai/gate';

export const runtime = 'nodejs';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAiRoot();
  if (gate.error) return gate.error;
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ message: 'id inválido.' }, { status: 400 });
  }
  try {
    return NextResponse.json(await getReviewRun(gate.db, id));
  } catch (e) {
    if (e instanceof ReviewRunNotFoundError) {
      return NextResponse.json({ message: e.message }, { status: 404 });
    }
    return jsonError(e);
  }
}
