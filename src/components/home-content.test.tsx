import { describe, expect, it, vi } from 'vitest';
import { renderToReadableStream } from 'react-dom/server';
import type { ReactNode } from 'react';

// Dados do carrossel de categorias vêm do servidor (sem fetch no navegador).
vi.mock('./home/category-rail-items', () => ({
  loadCategoryRailItems: vi.fn(async () => [
    { id: 10, name: 'Eventos', slug: 'eventos', icon: null, count: 3 },
    { id: 20, name: 'Comer e beber', slug: 'comer', icon: null, count: 1 },
  ]),
}));

import { AppPreferencesProvider } from '@kizuna/core/client/providers/app-preferences-provider';
import { HomeContent } from './home-content';
import { loadCategoryRailItems } from './home/category-rail-items';

async function render(node: ReactNode) {
  const stream = await renderToReadableStream(<AppPreferencesProvider>{node}</AppPreferencesProvider>);
  await stream.allReady;
  return new Response(stream).text();
}

describe('HomeContent (Server Component)', () => {
  it('entrega no HTML os cards de categoria buscados no servidor e os blocos montados na page', async () => {
    const html = await render(
      <HomeContent
        showHero={false}
        categoriesVariant="compact"
        categoriesOnlyWithListings
        inkPicker={false}
        inkLevel={6}
        showNearby={false}
        cityName="Cuiabá"
        categoryRails={<section id="trilhas"><a href="/cuiaba-mt/anuncio/abc?src=home">Show</a></section>}
        newsHighlights={<section id="noticias">Notícias</section>}
      />
    );
    expect(loadCategoryRailItems).toHaveBeenCalledWith({ groupBy: 'group', onlyWithListings: true });
    expect(html).toContain('href="/busca?group=eventos"');
    expect(html).toContain('href="/busca?group=comer"');
    expect(html).not.toContain('animate-pulse');
    expect(html).toContain('href="/cuiaba-mt/anuncio/abc?src=home"');
    expect(html).toContain('id="noticias"');
    // sem seletor: <main> estático com o nível padrão, sem o picker
    expect(html).toMatch(/<main[^>]*data-home-ink-level="6"/);
  });

  it('com inkPicker, o <main> vira a ilha do seletor (conteúdo continua do servidor)', async () => {
    const html = await render(
      <HomeContent showHero={false} inkPicker inkLevel={3} showNearby={false} categoryRails={<p id="trilhas" />} />
    );
    expect(html).toMatch(/<main[^>]*data-home-ink-level="3"/);
    expect(html).toContain('id="trilhas"');
  });
});
