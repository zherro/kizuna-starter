import { describe, expect, it } from 'vitest';
import { shouldFetchScope } from '../../src/lib/eleicao/client';
import {
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
      escopo: 'BR',
      turno: '1',
      tse,
      totalizacao: { pctSecoes: '87,5', votosValidos: 10 },
      candidatos: [
        { seq: 2, numero: 22, nome: 'B', votos: 3, percentual: 30 },
        { seq: 1, numero: '13', nome: 'A', partido: 'PX', votos: 7, percentual: 70, eleito: true },
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
  });
  it('rejeita lixo e entende aguardando', () => {
    expect(parseEscopo(null)).toBeNull();
    expect(parseEscopo({})).toBeNull();
    expect(parseEscopo({ status: 'aguardando' })).toEqual({ status: 'aguardando' });
  });
});

describe('parseMeta / tseKey', () => {
  it('filtra ufs invalidas', () => {
    const m = parseMeta({ status: 'ok', tse, ufs: ['SP', 'sp', '../x', 'AC'] });
    expect(m?.ufs).toEqual(['SP', 'AC']);
    expect(tseKey(m?.tse)).toBe('04/10/2026|19:42:10');
    expect(tseKey(null)).toBeNull();
  });
});

describe('shouldFetchScope', () => {
  const meta = parseMeta({ status: 'ok', tse, ufs: ['SP'] })!;
  const cached = (key: string | null) => ({
    data: {
      status: 'ok' as const,
      escopo: 'BR',
      turno: 1,
      tse,
      totalizacao: { pctSecoes: null, votosValidos: null, brancos: null, nulos: null },
      candidatos: [],
    },
    tse: key,
  });
  it('busca sem cache', () => expect(shouldFetchScope(undefined, meta)).toBe(true));
  it('nao rebaixa quando dg/hg igual', () => {
    expect(shouldFetchScope(cached(tseKey(tse)), meta)).toBe(false);
  });
  it('rebaixa quando dg/hg mudou', () => {
    expect(shouldFetchScope(cached('01/01/2026|00:00:00'), meta)).toBe(true);
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
