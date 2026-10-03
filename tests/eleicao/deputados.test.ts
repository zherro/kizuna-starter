import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { isDeputado, parseDeputados } from '../../src/lib/eleicao/normalize';
import { deputadosUrl, fotoUrl } from '../../src/lib/eleicao/client';
import { compactVotes } from '../../src/lib/eleicao/dynamics';
import {
  depStats,
  fold,
  parseDepParams,
  queryDeputados,
  resetDepCache,
} from '../../src/lib/server/eleicao-deputados';
import { queryEleicao } from '../../src/lib/server/eleicao-data';

const FIX = path.resolve(__dirname, '../fixtures/eleicao');
const sp = (qs: string) => new URLSearchParams(qs);
const UFS = ['DF', 'MT', 'SP'];
/* eslint-disable @typescript-eslint/no-explicit-any */
const q = async (cargo: 'deputado-federal' | 'deputado-estadual', uf: string, qs = '') => {
  const r = await queryDeputados(cargo, uf, UFS, sp(qs), FIX);
  if (!r.ok) throw new Error(r.error);
  return r.body as any;
};

describe('parseDepParams', () => {
  it('defaults', () => {
    expect(parseDepParams(sp(''))).toEqual({
      ok: true,
      params: { q: '', partido: null, page: 1, limit: 30, eleitos: false },
    });
  });
  it('limit acima do maximo e reduzido a 50', () => {
    const r = parseDepParams(sp('limit=500'));
    expect(r.ok && r.params.limit).toBe(50);
  });
  it('page/limit invalidos -> erro', () => {
    for (const qs of ['page=0', 'page=-1', 'page=abc', 'page=1.5', 'page=1e3', 'page=']) {
      expect(parseDepParams(sp(qs))).toEqual({ ok: false, error: 'page_invalida' });
    }
    for (const qs of ['limit=0', 'limit=-5', 'limit=x', 'limit=10.2']) {
      expect(parseDepParams(sp(qs))).toEqual({ ok: false, error: 'limit_invalido' });
    }
  });
  it('q maximo 60 caracteres', () => {
    expect(parseDepParams(sp(`q=${'a'.repeat(60)}`)).ok).toBe(true);
    expect(parseDepParams(sp(`q=${'a'.repeat(61)}`))).toEqual({ ok: false, error: 'q_invalido' });
  });
  it('partido so [A-Za-z0-9 ./-]', () => {
    for (const ok of ['PXA', 'PX-A', 'PX A', 'P.X/A']) {
      expect(parseDepParams(sp(`partido=${encodeURIComponent(ok)}`)).ok).toBe(true);
    }
    for (const bad of ['PX;A', 'PX%A', 'PX<A>', 'PX"A', 'A'.repeat(21), 'PXÁ']) {
      expect(parseDepParams(sp(`partido=${encodeURIComponent(bad)}`))).toEqual({
        ok: false,
        error: 'partido_invalido',
      });
    }
  });
  it('eleitos=1', () => {
    const r = parseDepParams(sp('eleitos=1'));
    expect(r.ok && r.params.eleitos).toBe(true);
  });
});

describe('fold', () => {
  it('sem acento e minusculo', () => expect(fold('João Conceição ÂNGELA')).toBe('joao conceicao angela'));
});

describe('queryDeputados (fixtures)', () => {
  beforeEach(() => resetDepCache());

  it('devolve so uma fatia, com total, resumo por partido e cabecalho', async () => {
    const b = await q('deputado-federal', 'SP');
    expect(b.cargo).toBe('deputado-federal');
    expect(b.vagas).toBe(70);
    expect(b.total).toBe(150);
    expect(b.page).toBe(1);
    expect(b.pageSize).toBe(30);
    expect(b.candidatos).toHaveLength(30);
    expect(b.candidatos[0].pos).toBe(1);
    expect(b.candidatos[29].pos).toBe(30);
    expect(b.tse.dg).toBeTruthy();
    const sum = b.partidos.reduce((a: number, p: any) => a + p.candidatos, 0);
    expect(sum).toBe(150);
    for (let i = 1; i < b.partidos.length; i++) {
      expect(b.partidos[i - 1].votos).toBeGreaterThanOrEqual(b.partidos[i].votos);
    }
    // sem flag eleito no arquivo: eleitos = os `vagas` primeiros
    expect(b.partidos.reduce((a: number, p: any) => a + p.eleitos, 0)).toBe(70);
  });

  it('paginacao: paginas disjuntas, ultima parcial, alem do fim vazia', async () => {
    const p1 = await q('deputado-federal', 'SP', 'limit=50&page=1');
    const p2 = await q('deputado-federal', 'SP', 'limit=50&page=2');
    const p3 = await q('deputado-federal', 'SP', 'limit=50&page=3');
    const p4 = await q('deputado-federal', 'SP', 'limit=50&page=4');
    expect(p1.candidatos).toHaveLength(50);
    expect(p3.candidatos).toHaveLength(50);
    expect(p3.candidatos[0].pos).toBe(101);
    expect(p4.candidatos).toHaveLength(0);
    expect(p4.total).toBe(150);
    const ids = new Set([...p1.candidatos, ...p2.candidatos, ...p3.candidatos].map((c: any) => c.sqcand));
    expect(ids.size).toBe(150);
  });

  it('busca sem acento e sem diferenciar maiusculas', async () => {
    const withAccent = await q('deputado-federal', 'SP', `q=${encodeURIComponent('João')}&limit=50`);
    const plain = await q('deputado-federal', 'SP', 'q=JOAO&limit=50');
    expect(plain.total).toBeGreaterThan(0);
    expect(plain.total).toBe(withAccent.total);
    for (const c of plain.candidatos) expect(fold(c.nome)).toContain('joao');
    const conc = await q('deputado-federal', 'SP', 'q=conceicao&limit=50');
    for (const c of conc.candidatos) expect(fold(c.nome)).toContain('conceicao');
  });

  it('busca por numero e por partido; varias palavras = todas', async () => {
    const all = await q('deputado-federal', 'SP', 'limit=50');
    const target = all.candidatos[5];
    const byNum = await q('deputado-federal', 'SP', `q=${target.numero}`);
    expect(byNum.candidatos.some((c: any) => c.sqcand === target.sqcand)).toBe(true);
    const byParty = await q('deputado-federal', 'SP', `q=${target.partido.toLowerCase()}&limit=50`);
    expect(byParty.candidatos.some((c: any) => c.sqcand === target.sqcand)).toBe(true);
    const first = target.nome.split(' ')[0];
    const both = await q(
      'deputado-federal',
      'SP',
      `q=${encodeURIComponent(`${first} ${target.partido}`)}&limit=50`
    );
    expect(both.candidatos.some((c: any) => c.sqcand === target.sqcand)).toBe(true);
    for (const c of both.candidatos) expect(fold(`${c.nome} ${c.partido}`)).toContain(fold(first));
    expect((await q('deputado-federal', 'SP', 'q=zzzzzzzz')).total).toBe(0);
  });

  it('filtro por partido (sem diferenciar maiusculas) e total apos filtros', async () => {
    const r = await q('deputado-federal', 'SP', 'partido=pxa&limit=50');
    expect(r.total).toBeGreaterThan(0);
    for (const c of r.candidatos) expect(c.partido).toBe('PXA');
    const base = await q('deputado-federal', 'SP');
    expect(r.total).toBe(base.partidos.find((p: any) => p.sigla === 'PXA').candidatos);
    // o resumo continua sendo o da UF inteira (chips estaveis)
    expect(r.partidos).toEqual(base.partidos);
    const both = await q('deputado-federal', 'SP', 'partido=PXA&q=silva&limit=50');
    for (const c of both.candidatos) {
      expect(c.partido).toBe('PXA');
      expect(fold(c.nome)).toContain('silva');
    }
  });

  it('eleitos=1: os `vagas` primeiros por votos (sem flag no arquivo)', async () => {
    const r = await q('deputado-federal', 'SP', 'eleitos=1&limit=50');
    expect(r.total).toBe(70);
    expect(r.candidatos).toHaveLength(50);
    const r2 = await q('deputado-federal', 'SP', 'eleitos=1&limit=50&page=2');
    expect(r2.candidatos).toHaveLength(20);
    expect(r2.candidatos[19].pos).toBe(70);
    const p = await q('deputado-federal', 'SP', 'eleitos=1&partido=PXA&limit=50');
    for (const c of p.candidatos) expect(c.pos).toBeLessThanOrEqual(70);
  });

  it('eleitos=1 usa o flag eleito quando o arquivo traz', async () => {
    const r = await q('deputado-federal', 'DF', 'eleitos=1&limit=50');
    expect(r.total).toBe(8);
    for (const c of r.candidatos) expect(c.eleito).toBe(true);
  });

  it('cargoNome (Deputado Distrital) so no DF estadual', async () => {
    const df = await q('deputado-estadual', 'DF');
    expect(df.cargoNome).toBe('Deputado Distrital');
    expect(df.vagas).toBe(24);
    const sp = await q('deputado-estadual', 'SP');
    expect(sp.cargoNome).toBeUndefined();
    expect(sp.vagas).toBe(94);
  });

  it('uf fora do meta, ZZ, BR e traversal -> erro; sem arquivo -> aguardando', async () => {
    for (const uf of ['AC', 'ZZ', 'BR', '../meta', 'sp', null]) {
      expect(await queryDeputados('deputado-federal', uf, UFS, null, FIX)).toEqual({
        ok: false,
        error: 'uf_invalida',
      });
    }
    expect(await queryDeputados('deputado-federal', 'ZZ', ['ZZ'], null, FIX)).toEqual({
      ok: false,
      error: 'uf_invalida',
    });
    expect(
      await queryDeputados('deputado-federal', 'SP', ['SP'], null, path.join(FIX, 'nao-existe'))
    ).toEqual({ ok: true, body: { status: 'aguardando' } });
  });

  it('parametros invalidos viram erro via queryEleicao', async () => {
    expect(await queryEleicao('deputado-federal', 'uf', 'SP', FIX, sp('page=0'))).toEqual({
      ok: false,
      error: 'page_invalida',
    });
    expect(await queryEleicao('deputado-federal', 'uf', 'SP', FIX, sp('partido=a;b'))).toEqual({
      ok: false,
      error: 'partido_invalido',
    });
    expect(await queryEleicao('deputado-federal', 'nacional', null, FIX)).toEqual({
      ok: false,
      error: 'escopo_invalido',
    });
  });

  it('a resposta e reconhecida pelo normalizador do client', async () => {
    const b = await q('deputado-estadual', 'SP', 'page=2');
    const parsed = parseDeputados(JSON.parse(JSON.stringify(b)));
    expect(parsed?.status).toBe('ok');
    if (parsed?.status !== 'ok') return;
    expect(parsed.page).toBe(2);
    expect(parsed.total).toBe(160);
    expect(parsed.candidatos[0].pos).toBe(31);
    expect(parsed.partidos.length).toBeGreaterThan(3);
  });
});

describe('cache por mtime', () => {
  let dir: string;
  const file = () => path.join(dir, 'deputado-federal', 'SP.json');
  const doc = (nome: string) => ({
    cargo: 'deputado-federal',
    escopo: 'SP',
    vagas: 1,
    candidatos: [
      { seq: 1, numero: '111', sqcand: '1', nome, partido: 'PXA', votos: 10, percentual: 1, situacao: '', eleito: false },
    ],
  });
  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dep-'));
    await fs.mkdir(path.dirname(file()));
  });
  afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('nao reparseia sem mudanca e reparseia quando o arquivo muda', async () => {
    resetDepCache();
    await fs.writeFile(file(), JSON.stringify(doc('Primeiro')));
    const a = await queryDeputados('deputado-federal', 'SP', ['SP'], null, dir);
    await queryDeputados('deputado-federal', 'SP', ['SP'], sp('q=pri'), dir);
    await queryDeputados('deputado-federal', 'SP', ['SP'], sp('partido=PXA'), dir);
    expect(depStats.parses).toBe(1);
    expect(depStats.hits).toBe(2);
    expect(a.ok && (a.body.candidatos as any[])[0].nome).toBe('Primeiro');

    await fs.writeFile(file(), JSON.stringify(doc('Segundo versao maior')));
    const future = new Date(Date.now() + 5000);
    await fs.utimes(file(), future, future);
    const b = await queryDeputados('deputado-federal', 'SP', ['SP'], null, dir);
    expect(depStats.parses).toBe(2);
    expect(b.ok && (b.body.candidatos as any[])[0].nome).toBe('Segundo versao maior');
  });

  it('arquivo removido -> aguardando', async () => {
    await fs.rm(file());
    expect(await queryDeputados('deputado-federal', 'SP', ['SP'], null, dir)).toEqual({
      ok: true,
      body: { status: 'aguardando' },
    });
  });
});

describe('helpers', () => {
  it('isDeputado', () => {
    expect(isDeputado('deputado-federal')).toBe(true);
    expect(isDeputado('deputado-estadual')).toBe(true);
    for (const bad of ['deputado', 'senador', '../deputado-federal', null]) {
      expect(isDeputado(bad)).toBe(false);
    }
  });
  it('urls do client', () => {
    expect(deputadosUrl({ cargo: 'deputado-federal', uf: 'SP' })).toBe(
      '/api/eleicao?cargo=deputado-federal&escopo=uf&uf=SP'
    );
    expect(
      deputadosUrl({ cargo: 'deputado-federal', uf: 'SP', q: 'joão silva', partido: 'PXA', page: 2, limit: 30, eleitos: true })
    ).toBe('/api/eleicao?cargo=deputado-federal&escopo=uf&uf=SP&q=jo%C3%A3o+silva&partido=PXA&page=2&limit=30&eleitos=1');
    expect(fotoUrl('12')).toBe('/api/eleicao/foto/12');
    expect(fotoUrl('12', 'deputado-federal', 'SP')).toBe('/api/eleicao/foto/12?cargo=deputado-federal&uf=SP');
    expect(fotoUrl('12', 'senador', 'SP')).toBe('/api/eleicao/foto/12');
  });
  it('compactVotes', () => {
    expect(compactVotes(950)).toBe('950');
    expect(compactVotes(85_400)).toBe('85 mil');
    expect(compactVotes(1_250_000)).toBe('1,3 mi');
  });
});
