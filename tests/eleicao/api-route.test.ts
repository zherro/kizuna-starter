import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const FIX = path.resolve(__dirname, '../fixtures/eleicao');
let n = 0;
// IP distinto por chamada: o limite de 5/10s e por IP e nao e o foco destes testes.
const get = async (qs: string) => {
  const { GET } = await import('../../src/app/api/eleicao/route');
  return GET(
    new Request(`http://localhost/api/eleicao?${qs}`, { headers: { 'x-forwarded-for': `10.0.0.${++n}` } })
  );
};

describe('GET /api/eleicao', () => {
  const old = process.env.ELEICAO_DATA_PATH;
  beforeAll(() => {
    process.env.ELEICAO_DATA_PATH = FIX;
  });
  afterAll(() => {
    if (old === undefined) delete process.env.ELEICAO_DATA_PATH;
    else process.env.ELEICAO_DATA_PATH = old;
  });

  it('cargo default = presidente', async () => {
    const res = await get('escopo=nacional');
    expect(res.status).toBe(200);
    expect((await res.json()).cargo).toBe('presidente');
  });

  it('cada cargo por UF', async () => {
    for (const cargo of ['presidente', 'governador', 'senador']) {
      const res = await get(`cargo=${cargo}&escopo=uf&uf=SP`);
      expect(res.status).toBe(200);
      expect((await res.json()).cargo).toBe(cargo);
    }
  });

  it('400 para cargo invalido, nacional fora de presidente e UF fora do cargo', async () => {
    expect((await get('cargo=deputado&escopo=meta')).status).toBe(400);
    expect((await get('cargo=..%2Fpresidente&escopo=uf&uf=SP')).status).toBe(400);
    expect((await get('cargo=senador&escopo=nacional')).status).toBe(400);
    expect((await get('cargo=governador&escopo=nacional')).status).toBe(400);
    expect((await get('cargo=governador&escopo=uf&uf=ZZ')).status).toBe(400);
    expect((await get('cargo=presidente&escopo=uf&uf=..%2Fmeta')).status).toBe(400);
  });

  it('mantem o limite de 5 requisicoes por 10s por IP (429 na sexta)', async () => {
    const { GET } = await import('../../src/app/api/eleicao/route');
    const mk = () =>
      GET(new Request('http://localhost/api/eleicao?escopo=meta', { headers: { 'x-forwarded-for': '203.0.113.9' } }));
    for (let i = 0; i < 5; i++) expect((await mk()).status).toBe(200);
    expect((await mk()).status).toBe(429);
  });
});
