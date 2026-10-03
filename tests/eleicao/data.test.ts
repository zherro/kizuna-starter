import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isAllowedUf, isCargo, isSqcand } from '../../src/lib/eleicao/normalize';
import { queryEleicao, readFoto } from '../../src/lib/server/eleicao-data';

const FIX = path.resolve(__dirname, '../fixtures/eleicao');

describe('isAllowedUf', () => {
  const ufs = ['AC', 'SP'];
  it('aceita UF da lista', () => expect(isAllowedUf('SP', ufs)).toBe(true));
  it('rejeita fora da lista, minuscula e path traversal', () => {
    for (const bad of ['RJ', 'sp', '../meta', '..%2fmeta', 'SP/../AC', 'SP.json', '', 'S', undefined, 5]) {
      expect(isAllowedUf(bad, ufs)).toBe(false);
    }
  });
  it('BR nunca e UF', () => expect(isAllowedUf('BR', ['BR', 'SP'])).toBe(false));
});

describe('isCargo / isSqcand', () => {
  it('allowlist de cargo', () => {
    for (const ok of ['presidente', 'governador', 'senador']) expect(isCargo(ok)).toBe(true);
    for (const bad of ['deputado', 'Presidente', '../presidente', 'presidente/..', '', null, undefined, 1]) {
      expect(isCargo(bad)).toBe(false);
    }
  });
  it('sqcand so com digitos', () => {
    expect(isSqcand('1000001')).toBe(true);
    for (const bad of ['', 'abc', '10a', '../1', '1/2', '1.jpeg', ' 1', '1 ', '-1', '1'.repeat(21), undefined]) {
      expect(isSqcand(bad)).toBe(false);
    }
  });
});

describe('queryEleicao', () => {
  it('le meta e escopos de cada cargo das fixtures', async () => {
    const meta = await queryEleicao(null, 'meta', null, FIX);
    expect(meta.ok && meta.body.status).toBe('ok');
    const nac = await queryEleicao(null, 'nacional', null, FIX); // cargo default = presidente
    expect(nac.ok && nac.body.cargo).toBe('presidente');
    expect(nac.ok && (nac.body.candidatos as unknown[]).length).toBeGreaterThanOrEqual(4);
    const pres = await queryEleicao('presidente', 'uf', 'SP', FIX);
    expect(pres.ok && pres.body.escopo).toBe('SP');
    const gov = await queryEleicao('governador', 'uf', 'SP', FIX);
    expect(gov.ok && gov.body.cargo).toBe('governador');
    const sen = await queryEleicao('senador', 'uf', 'SP', FIX);
    expect(sen.ok && sen.body.vagas).toBe(2);
  });

  it('cargo fora da allowlist ou com traversal -> erro', async () => {
    for (const bad of ['deputado', '../presidente', 'presidente/../senador', '..\\x', '']) {
      expect(await queryEleicao(bad, 'meta', null, FIX)).toEqual({ ok: false, error: 'cargo_invalido' });
      expect(await queryEleicao(bad, 'uf', 'SP', FIX)).toEqual({ ok: false, error: 'cargo_invalido' });
    }
  });

  it('nacional so vale para presidente', async () => {
    expect((await queryEleicao('presidente', 'nacional', null, FIX)).ok).toBe(true);
    for (const c of ['governador', 'senador']) {
      expect(await queryEleicao(c, 'nacional', null, FIX)).toEqual({ ok: false, error: 'escopo_invalido' });
    }
  });

  it('uf invalida, de outro cargo ou traversal -> erro, sem ler disco', async () => {
    expect(await queryEleicao('presidente', 'uf', '../meta', FIX)).toEqual({ ok: false, error: 'uf_invalida' });
    expect(await queryEleicao('presidente', 'uf', 'RJ', FIX)).toEqual({ ok: false, error: 'uf_invalida' });
    expect(await queryEleicao('presidente', 'uf', 'SP/../AC', FIX)).toEqual({ ok: false, error: 'uf_invalida' });
    expect(await queryEleicao('presidente', 'uf', 'BR', FIX)).toEqual({ ok: false, error: 'uf_invalida' });
    expect(await queryEleicao('presidente', 'uf', null, FIX)).toEqual({ ok: false, error: 'uf_invalida' });
    // ZZ (Exterior) existe so para presidente
    expect((await queryEleicao('presidente', 'uf', 'ZZ', FIX)).ok).toBe(true);
    expect(await queryEleicao('governador', 'uf', 'ZZ', FIX)).toEqual({ ok: false, error: 'uf_invalida' });
  });

  it('escopo invalido', async () => {
    expect(await queryEleicao('presidente', 'x', null, FIX)).toEqual({ ok: false, error: 'escopo_invalido' });
  });

  it('UF valida sem arquivo -> aguardando (nunca erro)', async () => {
    // fixtures: senador/AC.json nao existe de proposito
    expect(await queryEleicao('senador', 'uf', 'AC', FIX)).toEqual({ ok: true, body: { status: 'aguardando' } });
  });

  it('diretorio ausente -> aguardando', async () => {
    const dir = path.join(FIX, 'nao-existe');
    expect(await queryEleicao('presidente', 'meta', null, dir)).toEqual({ ok: true, body: { status: 'aguardando' } });
    expect(await queryEleicao('presidente', 'nacional', null, dir)).toEqual({ ok: true, body: { status: 'aguardando' } });
  });
});

describe('readFoto', () => {
  it('le a foto existente e devolve null para ausente ou id invalido', async () => {
    const buf = await readFoto('1000001', FIX);
    expect(buf?.subarray(0, 2).toString('hex')).toBe('ffd8'); // JPEG
    expect(await readFoto('9999999', FIX)).toBeNull();
    expect(await readFoto('../meta', FIX)).toBeNull();
    expect(await readFoto('1/../../meta', FIX)).toBeNull();
  });
});
