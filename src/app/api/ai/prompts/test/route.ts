import { NextResponse } from 'next/server';
import {
  buildServiceContext,
  loadReviewPrompt,
  runSkill,
  REVIEW_PROMPT_KEY,
  TEXT_REVIEW_SKILL_KEY,
  type TextReviewInput,
  type TextReviewOutput,
} from '@kizuna/core/server/ai';
import { jsonError, requireAiAccess } from '@/lib/server/ai-gate';

export const runtime = 'nodejs';

/** Roda o prompt em UM anúncio sem gravar revisão. `overrides` testa edições ainda não salvas. */
export async function POST(request: Request) {
  const gate = await requireAiAccess('manage');
  if (gate.error) return gate.error;
  const body = (await request.json().catch(() => null)) as {
    promptKey?: string;
    serviceId?: number;
    overrides?: {
      systemPrompt?: string;
      userTemplate?: string;
      provider?: string | null;
      model?: string | null;
      temperature?: number | null;
    };
  } | null;
  const serviceId = Number(body?.serviceId);
  if ((body?.promptKey ?? REVIEW_PROMPT_KEY) !== REVIEW_PROMPT_KEY) {
    return NextResponse.json({ message: 'Prompt não suportado para teste.' }, { status: 400 });
  }
  if (!Number.isInteger(serviceId) || serviceId <= 0) {
    return NextResponse.json({ message: 'Anúncio inválido.' }, { status: 400 });
  }
  try {
    const context = await buildServiceContext(serviceId);
    if (!context.description.trim()) {
      return NextResponse.json({ message: 'O anúncio não tem descrição.' }, { status: 400 });
    }
    const base = await loadReviewPrompt(context.categoryId);
    const o = body?.overrides ?? {};
    const prompt = {
      ...base,
      systemPrompt: o.systemPrompt?.trim() || base.systemPrompt,
      userTemplate: o.userTemplate?.trim() || base.userTemplate,
      provider: o.provider !== undefined ? o.provider || null : base.provider,
      model: o.model !== undefined ? o.model || null : base.model,
      temperature: o.temperature !== undefined ? o.temperature : base.temperature,
    };
    const r = await runSkill<TextReviewInput, TextReviewOutput>(
      TEXT_REVIEW_SKILL_KEY,
      { serviceId, context, prompt },
      { userId: gate.session.user_id, tenantId: context.tenantId ?? '' },
      { provider: prompt.provider, model: prompt.model, temperature: prompt.temperature }
    );
    return NextResponse.json({
      original: context.description,
      revised: r.output.revised,
      provider: r.provider,
      model: r.model,
      tokensIn: r.usage?.tokensIn ?? 0,
      tokensOut: r.usage?.tokensOut ?? 0,
    });
  } catch (e) {
    return jsonError(e, 422);
  }
}
