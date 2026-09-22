import { NextRequest, NextResponse } from 'next/server';
import { getAuthHeaderFromCookies, getServiceAuthHeader, getSession } from '@kizuna/core/server';

export const runtime = 'nodejs';

const POSTGREST_URL = process.env.POSTGREST_URL || 'http://127.0.0.1:3000';

function makeHeaders(authHeader: string | null, withJson = false): Record<string, string> {
  return {
    ...(withJson ? { 'Content-Type': 'application/json' } : {}),
    'Accept-Profile': 'public',
    'Content-Profile': 'public',
    Accept: 'application/json',
    Prefer: 'resolution=merge-duplicates,return=representation',
    ...(authHeader ? { Authorization: authHeader } : {}),
  };
}

function isPermissionDeniedError(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const error = value as { code?: unknown; message?: unknown };
  return (
    String(error.code ?? '') === '42501' ||
    String(error.message ?? '')
      .toLowerCase()
      .includes('permission denied') ||
    String(error.message ?? '')
      .toLowerCase()
      .includes('row-level security')
  );
}

async function fetchSecondStepId(role: string, authHeader: string | null): Promise<string | null> {
  const query = new URLSearchParams({
    select: 'id',
    role: `eq.${role}`,
    active: 'eq.true',
    step_order: 'eq.2',
    limit: '1',
  });

  const response = await fetch(`${POSTGREST_URL}/onboarding_steps?${query.toString()}`, {
    headers: makeHeaders(authHeader),
  });

  if (!response.ok) return null;
  const rows = (await response.json().catch(() => [])) as Array<{ id?: string }>;
  return rows[0]?.id ?? null;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as { code?: unknown } | null;
    const code = String(body?.code ?? '').trim();
    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json(
        { error: 'Codigo invalido. Informe os 6 digitos.' },
        { status: 400 }
      );
    }

    const userAuthHeader = await getAuthHeaderFromCookies();
    const serviceAuthHeader = getServiceAuthHeader();
    let headers = makeHeaders(userAuthHeader);

    const userDataUrl =
      `${POSTGREST_URL}/user_data?user_id=eq.${encodeURIComponent(session.user_id)}` +
      `&tenant_id=eq.${encodeURIComponent(session.tenant_id)}` +
      '&limit=1';

    let response = await fetch(userDataUrl, { headers });
    let dataOrError = (await response.json().catch(() => null)) as unknown;

    if (!response.ok && isPermissionDeniedError(dataOrError) && serviceAuthHeader) {
      headers = makeHeaders(serviceAuthHeader);
      response = await fetch(userDataUrl, { headers });
      dataOrError = (await response.json().catch(() => null)) as unknown;
    }

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Falha ao carregar dados do usuario', details: dataOrError },
        { status: response.status }
      );
    }

    const rows = Array.isArray(dataOrError) ? (dataOrError as Array<Record<string, unknown>>) : [];
    const userData = rows[0];

    if (!userData) {
      return NextResponse.json({ error: 'Dados do usuario nao encontrados.' }, { status: 404 });
    }

    const expectedCode = String(userData.email_verification_code ?? '').trim();
    if (!expectedCode || expectedCode !== code) {
      return NextResponse.json({ error: 'Codigo incorreto. Tente novamente.' }, { status: 400 });
    }

    const patchUrl =
      `${POSTGREST_URL}/user_data?user_id=eq.${encodeURIComponent(session.user_id)}` +
      `&tenant_id=eq.${encodeURIComponent(session.tenant_id)}`;

    const patchPayload = {
      email_verified: true,
      email_verification_code: null,
    };

    let patchHeaders = makeHeaders(userAuthHeader, true);
    let patchResponse = await fetch(patchUrl, {
      method: 'PATCH',
      headers: patchHeaders,
      body: JSON.stringify(patchPayload),
    });

    let patchResult = (await patchResponse.json().catch(() => null)) as unknown;

    if (!patchResponse.ok && isPermissionDeniedError(patchResult) && serviceAuthHeader) {
      patchHeaders = makeHeaders(serviceAuthHeader, true);
      patchResponse = await fetch(patchUrl, {
        method: 'PATCH',
        headers: patchHeaders,
        body: JSON.stringify(patchPayload),
      });
      patchResult = (await patchResponse.json().catch(() => null)) as unknown;
    }

    if (!patchResponse.ok) {
      return NextResponse.json(
        { error: 'Falha ao confirmar e-mail', details: patchResult },
        { status: patchResponse.status }
      );
    }

    const stepId =
      (await fetchSecondStepId('advertiser', userAuthHeader)) ||
      (serviceAuthHeader ? await fetchSecondStepId('advertiser', serviceAuthHeader) : null);

    if (stepId) {
      const progressPayload = {
        user_id: session.user_id,
        step_id: stepId,
        status: 'completed',
        completed_at: new Date().toISOString(),
      };

      const upsertUrl = new URL(`${POSTGREST_URL}/onboarding_progress`);
      upsertUrl.searchParams.set('on_conflict', 'user_id,step_id');

      let progressHeaders = makeHeaders(userAuthHeader, true);
      let progressResponse = await fetch(upsertUrl.toString(), {
        method: 'POST',
        headers: progressHeaders,
        body: JSON.stringify(progressPayload),
      });

      const progressResult = (await progressResponse.json().catch(() => null)) as unknown;

      if (!progressResponse.ok && isPermissionDeniedError(progressResult) && serviceAuthHeader) {
        progressHeaders = makeHeaders(serviceAuthHeader, true);
        progressResponse = await fetch(upsertUrl.toString(), {
          method: 'POST',
          headers: progressHeaders,
          body: JSON.stringify(progressPayload),
        });
      }
    }

    return NextResponse.json({ message: 'E-mail verificado com sucesso.' });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
