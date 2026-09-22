import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { getSession } from '@kizuna/core/server';

export const runtime = 'nodejs';

/**
 * On-demand cache invalidation for the public `/[slug]` route, called by `PagesAdmin` after a
 * create / edit / soft-delete. Gated on the same `pages.manage` permission that RLS enforces on
 * the write itself (root always passes). Body: `{ slug: string, previousSlug?: string }`.
 */
export async function POST(request: Request) {
  const session = await getSession();
  const pagesPerms = session?.perms?.pages as { manage?: boolean } | undefined;
  const allowed = session?.is_root === true || pagesPerms?.manage === true;
  if (!allowed) {
    return NextResponse.json({ message: 'Acesso negado.' }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    slug?: unknown;
    previousSlug?: unknown;
  } | null;

  const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const targets = [body?.slug, body?.previousSlug].filter(
    (value): value is string => typeof value === 'string' && slugPattern.test(value)
  );

  if (targets.length === 0) {
    return NextResponse.json({ message: 'Nenhum slug válido informado.' }, { status: 400 });
  }

  for (const slug of targets) {
    revalidatePath(`/${slug}`);
  }

  return NextResponse.json({ revalidated: targets });
}
