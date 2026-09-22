import {
  createResource,
  executeRpcResource,
  isRpcResource,
  listResource,
} from '@kizuna/core/server';

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
  if (isRpcResource(resource)) return executeRpcResource(resource, request);
  return createResource(resource, request);
}
