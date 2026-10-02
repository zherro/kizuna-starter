import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isAllowedUf } from '../../src/lib/eleicao/normalize';
import { queryEleicao } from '../../src/lib/server/eleicao-data';

const FIX = path.resolve(__dirname, '../fixtures/eleicao');

describe('isAllowedUf', () => {
  const ufs = ['AC', 'SP'];
  it('aceita UF da lista', () => expect(isAllowedUf('SP', ufs)).toBe(true));
  it('rejeita fora da lista, minuscula e path traversal', () => {
    for (const bad of ['RJ', 'sp', '../meta', '..%2fmeta', 'SP/../AC', 'SP.json', '', 'S', undefined, 5]) {
      expect(isAllowedUf(bad, ufs)).toBe(false);
    }
  });
});

describe('queryEleicao', () => {
  it('le meta, nacional e uf das fixtures', async () => {
    const meta = await queryEleicao('meta', null, FIX);
    expect(meta.ok && meta.body.status).toBe('ok');
    const nac = await queryEleicao('nacional', null, FIX);
    expect(nac.ok && (nac.body.candidatos as unknown[]).length).toBeGreaterThan(0);
    const sp = await queryEleicao('uf', 'SP', FIX);
    expect(sp.ok && sp.body.escopo).toBe('SP');
  });
  it('uf invalida ou traversal -> erro, sem ler disco', async () => {
    expect(await queryEleicao('uf', '../meta', FIX)).toEqual({ ok: false, error: 'uf_invalida' });
    expect(await queryEleicao('uf', 'RJ ', FIX)).toEqual({ ok: false, error: 'uf_invalida' });
    expect(await queryEleicao('uf', null, FIX)).toEqual({ ok: false, error: 'uf_invalida' });
  });
  it('escopo invalido', async () => {
    expect(await queryEleicao('x', null, FIX)).toEqual({ ok: false, error: 'escopo_invalido' });
  });
  it('arquivo ausente -> aguardando (nunca erro)', async () => {
    const dir = path.join(FIX, 'nao-existe');
    expect(await queryEleicao('meta', null, dir)).toEqual({ ok: true, body: { status: 'aguardando' } });
    expect(await queryEleicao('nacional', null, dir)).toEqual({ ok: true, body: { status: 'aguardando' } });
  });
});
