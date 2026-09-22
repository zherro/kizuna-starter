import { NextRequest, NextResponse } from 'next/server';
import { getAuthHeaderFromCookies, getServiceAuthHeader, getSession } from '@kizuna/core/server';

const POSTGREST_URL = process.env.POSTGREST_URL || 'http://127.0.0.1:3000';

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

function makeHeaders(authHeader: string | null): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Accept-Profile': 'public',
    'Content-Profile': 'public',
    Prefer: 'resolution=merge-duplicates,return=representation',
    ...(authHeader ? { Authorization: authHeader } : {}),
  };
}

/**
 * POST /api/onboarding/progress
 * Upserts onboarding progress record (handles UNIQUE constraint on user_id, step_id)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const { step_id, status, completedAt } = body as {
      step_id?: unknown;
      status?: unknown;
      completedAt?: unknown;
    };

    // Validate required fields
    if (!step_id || !status) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Always use session user_id — never trust client-supplied value
    const payload = {
      user_id: session.user_id,
      step_id: String(step_id),
      status: String(status).trim(),
      completed_at: status === 'completed' ? completedAt || new Date().toISOString() : null,
    };

    const userAuthHeader = await getAuthHeaderFromCookies();
    const serviceAuthHeader = getServiceAuthHeader();
    let headers = makeHeaders(userAuthHeader);

    const upsertUrl = new URL(`${POSTGREST_URL}/onboarding_progress`);
    upsertUrl.searchParams.set('on_conflict', 'user_id,step_id');

    let response = await fetch(upsertUrl.toString(), {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    let result = (await response.json().catch(() => null)) as unknown;

    if (!response.ok && isPermissionDeniedError(result) && serviceAuthHeader) {
      headers = makeHeaders(serviceAuthHeader);
      response = await fetch(upsertUrl.toString(), {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      result = (await response.json().catch(() => null)) as unknown;
    }

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to update progress', details: result },
        { status: response.status }
      );
    }

    return NextResponse.json({ data: result });
  } catch (error) {
    console.error('[onboarding-progress-api]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
