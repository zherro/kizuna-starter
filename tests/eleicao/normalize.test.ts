import { describe, expect, it } from 'vitest';
import { apiUrl, scopeKey, shouldFetchScope } from '../../src/lib/eleicao/client';
import {
  emptyTotalizacao,
  barWidth,
  formatPct,
  formatVotes,
  parseEscopo,
  parseMeta,
  tseKey,
} from '../../src/lib/eleicao/normalize';

const tse = { dg: '04/10/2026', hg: '19:42:10' };

describe('parseEscopo', () => {
  it('normaliza e ordena por votos', () => {
    const r = parseEscopo({
      cargo: 'senador',
      vagas: '2',
      escopo: 'BR',
      turno: '1',
      tse,
      totalizacao: { pctSecoes: '87,5', votosValidos: 10 },
      candidatos: [
        { seq: 2, numero: 22, sqcand: 555, nome: 'B', votos: 3, percentual: 30 },
        { seq: 1, numero: '13', sqcand: '../x', nome: 'A', partido: 'PX', votos: 7, percentual: 70, eleito: true },
        { nome: '', votos: 1 },
        { nome: 'sem votos' },
      ],
    });
    expect(r?.status).toBe('ok');
    if (r?.status !== 'ok') return;
    expect(r.turno).toBe(1);
    expect(r.totalizacao.pctSecoes).toBe(87.5);
    expect(r.totalizacao.brancos).toBeNull();
    expect(r.candidatos.map((c) => c.nome)).toEqual(['A', 'B']);
    expect(r.candidatos[1].numero).toBe('22');
    expect(r.candidatos[0].eleito).toBe(true);
    expect(r.cargo).toBe('senador');
    expect(r.vagas).toBe(2);
    // sqcand so vale se for digitos (vira nome de arquivo)
    expect(r.candidatos[1].sqcand).toBe('555');
    expect(r.candidatos[0].sqcand).toBe('');
  });
  it('cargo desconhecido e vagas invalidas viram null', () => {
    const r = parseEscopo({ cargo: 'deputado', vagas: 0, candidatos: [] });
    expect(r?.status === 'ok' && r.cargo).toBeNull();
    expect(r?.status === 'ok' && r.vagas).toBeNull();
  });
  it('rejeita lixo e entende aguardando', () => {
    expect(parseEscopo(null)).toBeNull();
    expect(parseEscopo({})).toBeNull();
    expect(parseEscopo({ status: 'aguardando' })).toEqual({ status: 'aguardando' });
  });
});

describe('totalizacao completa', () => {
  const base = { cargo: 'senador', escopo: 'SP', candidatos: [{ nome: 'A', votos: 1 }] };
  it('le os campos novos (numeros e strings) e os ausentes viram null', () => {
    const r = parseEscopo({
      ...base,
      totalizacao: {
        pctSecoes: 81.7,
        secoesTotal: 1000,
        secoesTotalizadas: '817',
        secoesNaoTotalizadas: 183,
        eleitorado: 33000000,
        pEleitoradoApurado: '80,5',
        comparecimento: 26000000,
        pComparecimento: 78.8,
        abstencoes: 7000000,
        pAbstencao: 21.2,
        votosTotais: 25000000,
        pValidos: 90,
        pBrancos: 4,
        pNulos: 6,
        lixo: 1,
      },
    });
    expect(r?.status).toBe('ok');
    if (r?.status !== 'ok') return;
    const t = r.totalizacao;
    expect(t.secoesTotalizadas).toBe(817);
    expect(t.pEleitoradoApurado).toBe(80.5);
    expect(t.pNulos).toBe(6);
    expect(t.eleitoradoApurado).toBeNull();
    expect(t.votosValidos).toBeNull();
    expect('lixo' in t).toBe(false);
  });
  it('totalizacao ausente ou invalida -> tudo null', () => {
    for (const totalizacao of [undefined, null, 'x', [], { pctSecoes: 'abc' }]) {
      const r = parseEscopo({ ...base, totalizacao });
      expect(r?.status === 'ok' && Object.values(r.totalizacao).every((v) => v === null)).toBe(true);
    }
  });
});

describe('parseMeta / tseKey', () => {
  it('filtra ufs invalidas e le o tse por cargo', () => {
    const m = parseMeta({
      status: 'ok',
      ufs: ['SP', 'sp', '../x', 'AC', 'BR'],
      cargos: {
        presidente: { turno: 1, tse, ufs: ['SP', 'ZZ', 'x'] },
        senador: { tse, ufs: ['SP'] },
        deputado: { tse, ufs: ['SP'] },
      },
    });
    expect(m?.ufs).toEqual(['SP', 'AC']);
    expect(m?.cargos.presidente?.ufs).toEqual(['SP', 'ZZ']);
    expect(Object.keys(m?.cargos ?? {}).sort()).toEqual(['presidente', 'senador']);
    expect(tseKey(m?.cargos.presidente?.tse)).toBe('04/10/2026|19:42:10');
    expect(tseKey(null)).toBeNull();
  });
});

describe('scopeKey / apiUrl', () => {
  it('chave inclui o cargo', () => {
    expect(scopeKey('presidente', 'nacional', null)).toBe('presidente:BR');
    expect(scopeKey('senador', 'uf', 'SP')).toBe('senador:SP');
  });
  it('monta a URL da API', () => {
    expect(apiUrl('senador', 'uf', 'SP')).toBe('/api/eleicao?cargo=senador&escopo=uf&uf=SP');
    expect(apiUrl('presidente', 'nacional')).toBe('/api/eleicao?cargo=presidente&escopo=nacional');
  });
});

describe('shouldFetchScope', () => {
  const meta = parseMeta({
    status: 'ok',
    ufs: ['SP'],
    cargos: { presidente: { tse, ufs: ['SP'] }, senador: { tse: { dg: '04/10/2026', hg: '20:00:00' }, ufs: ['SP'] } },
  })!;
  const cached = (key: string | null) => ({
    data: {
      status: 'ok' as const,
      escopo: 'BR',
      turno: 1,
      tse,
      cargo: 'presidente' as const,
      vagas: null,
      totalizacao: emptyTotalizacao(),
      candidatos: [],
    },
    tse: key,
  });
  it('busca sem cache', () => expect(shouldFetchScope(undefined, meta, 'presidente')).toBe(true));
  it('nao rebaixa quando dg/hg igual', () => {
    expect(shouldFetchScope(cached(tseKey(tse)), meta, 'presidente')).toBe(false);
  });
  it('rebaixa quando dg/hg mudou', () => {
    expect(shouldFetchScope(cached('01/01/2026|00:00:00'), meta, 'presidente')).toBe(true);
  });
  it('compara pelo tse do PROPRIO cargo', () => {
    // presidente igual ao cache, senador publicou algo novo
    expect(shouldFetchScope(cached(tseKey(tse)), meta, 'senador')).toBe(true);
    expect(shouldFetchScope(cached(tseKey(tse)), meta, 'presidente')).toBe(false);
  });
  it('cargo sem tse no meta -> rebaixa (nao arrisca ficar velho)', () => {
    expect(shouldFetchScope(cached(tseKey(tse)), meta, 'governador')).toBe(true);
  });
});

describe('formatacao', () => {
  it('pt-BR', () => {
    expect(formatVotes(1234567)).toBe('1.234.567');
    expect(formatPct(87.5)).toBe('87,50%');
    expect(formatVotes(null)).toBe('—');
    expect(barWidth(120)).toBe(100);
    expect(barWidth(-3)).toBe(0);
  });
});
