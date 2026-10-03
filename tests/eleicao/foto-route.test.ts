import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const FIX = path.resolve(__dirname, '../fixtures/eleicao');
const ctx = (sqcand: string) => ({ params: Promise.resolve({ sqcand }) });
const req = () => new Request('http://localhost/api/eleicao/foto/x');

describe('GET /api/eleicao/foto/[sqcand]', () => {
  const old = process.env.ELEICAO_DATA_PATH;
  beforeAll(() => {
    process.env.ELEICAO_DATA_PATH = FIX;
  });
  afterAll(() => {
    if (old === undefined) delete process.env.ELEICAO_DATA_PATH;
    else process.env.ELEICAO_DATA_PATH = old;
  });

  it('serve a foto com cache longo e imutavel', async () => {
    const { GET } = await import('../../src/app/api/eleicao/foto/[sqcand]/route');
    const res = await GET(req(), ctx('1000001'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(res.headers.get('cache-control')).toBe('public, max-age=86400, immutable');
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(100);
  });

  it('foto ausente -> 404', async () => {
    const { GET } = await import('../../src/app/api/eleicao/foto/[sqcand]/route');
    expect((await GET(req(), ctx('9999999'))).status).toBe(404);
  });

  it('sqcand nao numerico -> 400, sem tocar o disco', async () => {
    const { GET } = await import('../../src/app/api/eleicao/foto/[sqcand]/route');
    for (const bad of ['abc', '..%2Fmeta', '../meta', '1.jpeg', '10a']) {
      expect((await GET(req(), ctx(bad))).status).toBe(400);
    }
  });

  it('nao consome o limite de 5/10s da rota de dados', async () => {
    const { GET } = await import('../../src/app/api/eleicao/foto/[sqcand]/route');
    const { sharedLimiter } = await import('../../src/lib/server/eleicao-rate-limit');
    const before = sharedLimiter().size();
    for (let i = 0; i < 20; i++) expect((await GET(req(), ctx('1000001'))).status).toBe(200);
    expect(sharedLimiter().size()).toBe(before);
  });
});
