import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ServiceResult } from '@kizuna/core/client/components/search/search-types';

const runServiceSearch = vi.fn();
const serverFetchResource = vi.fn();
const pgrstRpc = vi.fn();

vi.mock('@kizuna/core/server/services/service-search', () => ({
  runServiceSearch: (...args: unknown[]) => runServiceSearch(...args),
  seedFromKey: () => 0.1,
}));
vi.mock('@kizuna/core/server/postgrest-crud', () => ({
  serverFetchResource: (...args: unknown[]) => serverFetchResource(...args),
}));
vi.mock('@kizuna/core/server/postrest/conn', () => ({
  pgrstRpc: (...args: unknown[]) => pgrstRpc(...args),
}));

const {
  loadHomeNews,
  buildHomeNewsItems,
  newsKicker,
  newsSummary,
  homeNewsMoreHref,
} = await import('./noticias');

function result(over: Partial<ServiceResult>): ServiceResult {
  return {
    uid: 'u',
    title: 'Título',
    price: null,
    price_type: 'quote',
    category: 'Cidade',
    subcategory: null,
    sponsored: false,
    cover_file_id: null,
    provider_name: null,
    provider_avatar: null,
    rating: null,
    reviews: 0,
    city: 'Cuiabá',
    state: 'MT',
    ...over,
  };
}

const NOW = Date.parse('2026-10-13T18:00:00Z');

describe('newsKicker / newsSummary / homeNewsMoreHref', () => {
  it('chapéu é a subcategoria; sem ela, a categoria; sem nada, "Notícias"', () => {
    expect(newsKicker({ subcategory: 'Política', category: 'Cidade' })).toBe('Política');
    expect(newsKicker({ subcategory: '  ', category: 'Esportes' })).toBe('Esportes');
    expect(newsKicker({ subcategory: null, category: null })).toBe('Notícias');
  });

  it('resumo tira HTML e corta na palavra inteira', () => {
    expect(newsSummary('<p>Olá <b>mundo</b></p>')).toBe('Olá mundo');
    expect(newsSummary('')).toBeUndefined();
    const long = newsSummary('palavra '.repeat(60), 40)!;
    expect(long.endsWith('…')).toBe(true);
    expect(long.length).toBeLessThanOrEqual(41);
    expect(long).not.toMatch(/\s…$/);
  });

  it('"Ver todas" leva à busca do grupo, com a cidade quando há', () => {
    expect(homeNewsMoreHref()).toBe('/busca?group=noticias');
    expect(homeNewsMoreHref({ state: 'MT', ibge: '5103403', name: 'Cuiabá' })).toBe(
      '/busca?group=noticias&state=MT&cityId=5103403&cityName=Cuiab%C3%A1'
    );
  });
});

describe('buildHomeNewsItems', () => {
  it('ordena por publicação (mais recente primeiro), sem data vai pro fim e futura some', () => {
    const results = [
      result({ uid: 'a', title: 'Antiga', subcategory: 'Política', cover_file_id: 'fa' }),
      result({ uid: 'b', title: 'Sem data' }),
      result({ uid: 'c', title: 'Nova', subcategory: 'Esportes', cover_file_id: 'fc' }),
      result({ uid: 'd', title: 'Agendada' }),
      result({ uid: 'c', title: 'Nova (repetida)' }),
    ];
    const items = buildHomeNewsItems(
      results,
      new Map([['a', { uid: 'a', description: '<p>Resumo A</p>', createdAt: '2026-01-01T00:00:00Z' }]]),
      new Map<string, string | null>([
        ['a', '2026-10-12T09:00'],
        ['c', '2026-10-13T10:30'],
        ['d', '2026-10-20T10:00'],
      ]),
      { limit: 10, now: NOW }
    );
    expect(items.map((i) => i.title)).toEqual(['Nova', 'Antiga', 'Sem data']);
    // data local do formulário lida no fuso de Cuiabá (UTC-4)
    expect(items[0].publishedAt).toBe('2026-10-13T14:30:00.000Z');
    expect(items[0].kicker).toBe('Esportes');
    expect(items[0].href).toBe('/cuiaba-mt/anuncio/c');
    // manchete com imagem grande, lista com miniatura
    expect(items[0].image).toBe('/api/public/storage/files/fc/content');
    expect(items[1].image).toBe('/api/public/storage/files/fa/content?size=thumb');
    expect(items[1].summary).toBe('Resumo A');
    expect(items[2].image).toBeNull();
    expect(items[2].publishedAt).toBeNull();
  });

  it('sem data do formulário usa services.created_at e respeita o limit', () => {
    const items = buildHomeNewsItems(
      [result({ uid: 'x', title: 'X' }), result({ uid: 'y', title: 'Y' })],
      new Map([
        ['x', { uid: 'x', createdAt: '2026-10-10T00:00:00Z' }],
        ['y', { uid: 'y', createdAt: '2026-10-11T00:00:00Z' }],
      ]),
      new Map(),
      { limit: 1, now: NOW }
    );
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Y');
  });
});

describe('loadHomeNews', () => {
  beforeEach(() => {
    runServiceSearch.mockReset();
    serverFetchResource.mockReset();
    pgrstRpc.mockReset();
  });

  it('busca o grupo noticias com a cidade e monta os itens', async () => {
    runServiceSearch.mockResolvedValue([
      result({ uid: 'a', title: 'A', subcategory: 'Política' }),
      result({ uid: 'b', title: 'B' }),
    ]);
    serverFetchResource.mockResolvedValue([{ uid: 'b', description: 'Texto B', createdAt: null }]);
    pgrstRpc.mockImplementation(async (_rpc: string, body: { p_service_uid: string }) => ({
      ok: true,
      json: async () => [
        { answers: { data_publicacao: body.p_service_uid === 'b' ? '2026-10-13T12:00' : '2026-10-01T12:00' } },
      ],
    }));

    const items = await loadHomeNews({ cityIbge: '5103403', limit: 5, now: NOW });

    const [body] = runServiceSearch.mock.calls[0];
    expect(body).toMatchObject({ p_group_category_slug: 'noticias', p_city_ibge: '5103403', p_page_size: 24 });
    expect(serverFetchResource.mock.calls[0][0]).toBe('services');
    expect(serverFetchResource.mock.calls[0][2].where).toEqual({ uid: 'in.(a,b)' });
    expect(pgrstRpc).toHaveBeenCalledWith(
      'fn_get_public_service_form_answers',
      { p_service_uid: 'a' },
      { auth: null, schema: 'public' }
    );
    expect(items.map((i) => [i.title, i.kicker, i.summary])).toEqual([
      ['B', 'Cidade', 'Texto B'],
      ['A', 'Política', undefined],
    ]);
  });

  it('sem notícia (ou erro) devolve lista vazia sem buscar detalhes', async () => {
    runServiceSearch.mockResolvedValue([]);
    expect(await loadHomeNews()).toEqual([]);
    expect(serverFetchResource).not.toHaveBeenCalled();

    runServiceSearch.mockRejectedValue(new Error('rede'));
    expect(await loadHomeNews()).toEqual([]);
  });

  it('detalhes e datas falhando não derrubam: fica a ordem da busca', async () => {
    runServiceSearch.mockResolvedValue([result({ uid: 'a', title: 'A' }), result({ uid: 'b', title: 'B' })]);
    serverFetchResource.mockRejectedValue(new Error('x'));
    pgrstRpc.mockResolvedValue({ ok: false });
    const items = await loadHomeNews({ now: NOW });
    expect(items.map((i) => i.title)).toEqual(['A', 'B']);
  });
});
