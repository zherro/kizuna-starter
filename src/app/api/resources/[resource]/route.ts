import { NextResponse } from 'next/server';
import {
  canDoServer,
  createResource,
  executeRpcResource,
  isRpcResource,
  listResource,
} from '@kizuna/core/server';
import { accountLevelsSetup } from '@/lib/server/account-levels';
import { revalidateAfterResourceWrite, revalidateAfterRpc } from '@/lib/server/revalidate-ad-pages';

export const runtime = 'nodejs';

type Params = {
  params: Promise<{
    resource: string;
  }>;
};

export async function GET(request: Request, { params }: Params) {
  const { resource } = await params;
  return listResource(resource, request);
}

export async function POST(request: Request, { params }: Params) {
  const { resource } = await params;
  if (isRpcResource(resource)) {
    const res = await executeRpcResource(resource, request);
    if (res.ok) revalidateAfterRpc(resource);
    return res;
  }
  if (resource === 'services') {
    const can = await canDoServer(accountLevelsSetup, 'service.create');
    if (!can.allowed) {
      return NextResponse.json({ error: 'level_required', can }, { status: 403 });
    }
  }
  return revalidateAfterResourceWrite(resource, await createResource(resource, request));
}
