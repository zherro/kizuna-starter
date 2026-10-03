import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const FIX = path.resolve(__dirname, '../fixtures/eleicao');
const ctx = (sqcand: string) => ({ params: Promise.resolve({ sqcand }) });

describe('foto de deputado (proxy TSE)', () => {
  const old = process.env.ELEICAO_DATA_PATH;
  const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6]);
  const call = async (sqcand: string, qs: string) => {
    const { GET } = await import('../../src/app/api/eleicao/foto/[sqcand]/route');
    return GET(new Request(`http://localhost/api/eleicao/foto/${sqcand}?${qs}`), ctx(sqcand));
  };
  beforeAll(() => {
    process.env.ELEICAO_DATA_PATH = FIX;
  });
  afterAll(() => {
    if (old === undefined) delete process.env.ELEICAO_DATA_PATH;
    else process.env.ELEICAO_DATA_PATH = old;
  });
  afterEach(() => vi.unstubAllGlobals());

  it('monta a URL a partir do meta e devolve image/jpeg com cache imutavel', async () => {
    const fetchMock = vi.fn(async () => new Response(JPEG, { headers: { 'content-type': 'image/jpeg' } }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await call('5000099', 'cargo=deputado-federal&uf=SP');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(res.headers.get('cache-control')).toBe('public, max-age=86400, immutable');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:9/fixture/ele2026/547/fotos/sp/5000099.jpeg');
    expect(init.redirect).toBe('error');
    expect(init.signal).toBeDefined();
  });

  it('foto local tem prioridade (sem rede)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = await call('5000001', 'cargo=deputado-federal&uf=SP');
    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falha de rede, status != 200, corpo que nao e JPEG ou grande demais -> 404', async () => {
    const qs = 'cargo=deputado-federal&uf=SP';
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    expect((await call('5000098', qs)).status).toBe(404);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 404 })));
    expect((await call('5000098', qs)).status).toBe(404);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { headers: { 'content-type': 'text/html' } })));
    expect((await call('5000098', qs)).status).toBe(404);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1, 2, 3, 4, 5, 6]))));
    expect((await call('5000098', qs)).status).toBe(404);
    const huge = new Uint8Array(1_000_001).fill(0xff);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(huge, { headers: { 'content-type': 'image/jpeg' } })));
    expect((await call('5000098', qs)).status).toBe(404);
  });

  it('cargo/UF invalidos nunca chegam na rede (sem SSRF)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    for (const qs of [
      'cargo=xyz&uf=SP',
      'cargo=../x&uf=SP',
      'cargo=deputado-federal&uf=sp',
      'cargo=deputado-federal&uf=../..',
      'cargo=deputado-federal&uf=SP/../AC',
      'cargo=deputado-federal&uf=http://evil',
    ]) {
      expect([400, 404]).toContain((await call('5000097', qs)).status);
    }
    // UF fora do meta do cargo (AC nao tem deputado na fixture; ZZ e BR nunca)
    for (const uf of ['AC', 'ZZ', 'BR']) {
      expect((await call('5000097', `cargo=deputado-federal&uf=${uf}`)).status).toBe(400);
    }
    // cargo que nao e de deputado ou sem cargo/uf: so serve do volume
    expect((await call('5000097', 'cargo=senador&uf=SP')).status).toBe(404);
    expect((await call('5000097', '')).status).toBe(404);
    // sqcand nao numerico
    for (const bad of ['abc', '..%2Fx', '1.jpeg']) {
      expect((await call(bad, 'cargo=deputado-federal&uf=SP')).status).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fotoRemoteUrl: meta sem base/ciclo/eleicao ou fora do formato -> null (404 sem rede)', async () => {
    const { fotoRemoteUrl } = await import('../../src/lib/server/eleicao-data');
    const { parseMeta } = await import('../../src/lib/eleicao/normalize');
    const mk = (over: Record<string, unknown>, cargo: Record<string, unknown> = {}) =>
      parseMeta({
        status: 'ok',
        ambiente: 'oficial',
        base: 'https://tse.example',
        ...over,
        cargos: { 'deputado-federal': { ciclo: 'ele2026', eleicao: '547', ufs: ['SP'], ...cargo } },
      });
    const u = (m: ReturnType<typeof mk>, sq = '12') => fotoRemoteUrl(m, 'deputado-federal', 'SP', sq);
    expect(u(mk({}))).toBe('https://tse.example/oficial/ele2026/547/fotos/sp/12.jpeg');
    expect(u(mk({ base: null }))).toBeNull();
    expect(u(mk({}, { ciclo: null }))).toBeNull();
    expect(u(mk({}, { eleicao: null }))).toBeNull();
    expect(u(mk({}, { eleicao: '../x' }))).toBeNull();
    expect(u(mk({ base: 'ftp://x' }))).toBeNull();
    expect(u(mk({ base: 'https://u:p@x.io' }))).toBeNull();
    expect(u(mk({ ambiente: '../..' }))).toBeNull();
    expect(u(mk({}), '1/2')).toBeNull();
    expect(fotoRemoteUrl(null, 'deputado-federal', 'SP', '12')).toBeNull();
  });

  it('usa o limite proprio das fotos, nao o de 5/10s', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JPEG, { headers: { 'content-type': 'image/jpeg' } })));
    const { sharedLimiter } = await import('../../src/lib/server/eleicao-rate-limit');
    const before = sharedLimiter().size();
    for (let i = 0; i < 10; i++) {
      expect((await call('5000099', 'cargo=deputado-estadual&uf=SP')).status).toBe(200);
    }
    expect(sharedLimiter().size()).toBe(before);
  });
});
