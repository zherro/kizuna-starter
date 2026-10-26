import { deleteResource, getResourceById, updateResource } from '@kizuna/core/server';
import { revalidateAfterResourceWrite } from '@/lib/server/revalidate-ad-pages';

export const runtime = 'nodejs';

type Params = {
  params: Promise<{
    resource: string;
    id: string;
  }>;
};

export async function PUT(request: Request, { params }: Params) {
  const { resource, id } = await params;
  return revalidateAfterResourceWrite(resource, await updateResource(resource, id, request));
}

export async function GET(_request: Request, { params }: Params) {
  const { resource, id } = await params;
  return getResourceById(resource, id);
}

export async function PATCH(request: Request, { params }: Params) {
  const { resource, id } = await params;
  return revalidateAfterResourceWrite(resource, await updateResource(resource, id, request));
}

export async function DELETE(_request: Request, { params }: Params) {
  const { resource, id } = await params;
  return revalidateAfterResourceWrite(resource, await deleteResource(resource, id));
}
