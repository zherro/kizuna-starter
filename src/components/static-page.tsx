import { PageView } from '@kizuna/core/client/components/pages';

/**
 * Página institucional ESTÁTICA (texto no código, server component, sem banco). Cada rota fica em
 * `src/app/<nome>/page.tsx` — a pasta estática vence o `[cidade]`, senão o nome seria lido como
 * slug de cidade e daria 404.
 */
export function StaticPage({
  slug,
  title,
  description,
  content,
}: {
  slug: string;
  title: string;
  description: string;
  content: string;
}) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <PageView
        page={{ id: slug, slug, title, description, content, status: 'published', active: true }}
      />
    </main>
  );
}
