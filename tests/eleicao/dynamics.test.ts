import { describe, expect, it } from 'vitest';
import {
  highlightCount,
  initials,
  isLive,
  leadGap,
  positionMoves,
  toneFor,
  voteMix,
} from '../../src/lib/eleicao/dynamics';

const cand = (seq: number, sqcand = String(1000 + seq), votos = 0, percentual = 0) => ({
  seq,
  sqcand,
  votos,
  percentual,
});

describe('cor unica (hierarquia por intensidade)', () => {
  it('destaque = amarelo cheio; demais = tom suave; sem cor por candidato', () => {
    expect(toneFor(true)).toBe('var(--el-accent-strong)');
    expect(toneFor(false)).toBe('var(--el-bar)');
  });
});

describe('positionMoves', () => {
  const ids = (...s: number[]) => s.map((n) => cand(n));
  it('detecta quem subiu e quem caiu', () => {
    // antes: 1,2,3 ; depois: 2,1,3 -> 2 subiu 1, 1 caiu 1
    expect(positionMoves(ids(1, 2, 3), ids(2, 1, 3))).toEqual({ '1002': 1, '1001': -1 });
  });
  it('sem mudanca -> vazio', () => {
    expect(positionMoves(ids(1, 2, 3), ids(1, 2, 3))).toEqual({});
  });
  it('subida de varias posicoes e candidato novo ignorado', () => {
    expect(positionMoves(ids(1, 2, 3), ids(3, 1, 2))).toEqual({ '1003': 2, '1001': -1, '1002': -1 });
    expect(positionMoves(ids(1, 2), ids(1, 9, 2))).toEqual({ '1002': -1 });
  });
});

describe('leadGap', () => {
  it('diferenca entre 1o e 2o', () => {
    expect(leadGap([cand(1, 'a', 500, 38), cand(2, 'b', 300, 33.5)])).toEqual({ votos: 200, pp: 4.5 });
  });
  it('menos de 2 candidatos -> null', () => {
    expect(leadGap([cand(1)])).toBeNull();
    expect(leadGap([])).toBeNull();
  });
});

describe('isLive', () => {
  const now = Date.parse('2026-10-04T22:00:00Z');
  it('vivo com menos de 2 min', () => {
    expect(isLive('2026-10-04T21:59:00Z', now)).toBe(true);
    expect(isLive('2026-10-04T21:58:01Z', now)).toBe(true);
  });
  it('nao vivo com 2 min ou mais, ausente ou invalido', () => {
    expect(isLive('2026-10-04T21:58:00Z', now)).toBe(false);
    expect(isLive(null, now)).toBe(false);
    expect(isLive('lixo', now)).toBe(false);
  });
});

describe('highlightCount / initials', () => {
  it('vagas do Senador destacam N; demais cargos 1', () => {
    expect(highlightCount('senador', 2, 6)).toBe(2);
    expect(highlightCount('senador', null, 6)).toBe(1);
    expect(highlightCount('governador', 2, 6)).toBe(1);
    expect(highlightCount('senador', 2, 1)).toBe(1);
  });
  it('iniciais ignoram particulas', () => {
    expect(initials('Ana Beatriz Linhares da Rocha')).toBe('AR');
    expect(initials('Caio')).toBe('C');
    expect(initials('  ')).toBe('?');
  });
});

describe('voteMix', () => {
  it('fecha em 100% com base em votosTotais (validos = resto)', () => {
    const m = voteMix({ votosTotais: 1000, brancos: 40, nulos: 60 });
    expect(m?.map((p) => p.votos)).toEqual([900, 40, 60]);
    expect(m?.map((p) => p.key)).toEqual(['validos', 'brancos', 'nulos']);
    expect(m?.reduce((a, p) => a + p.pct, 0)).toBeCloseTo(100, 10);
    expect(m?.[0].pct).toBeCloseTo(90, 10);
  });
  it('null em qualquer campo ou dados incoerentes -> sem barra', () => {
    expect(voteMix({ votosTotais: null, brancos: 1, nulos: 1 })).toBeNull();
    expect(voteMix({ votosTotais: 10, brancos: null, nulos: 1 })).toBeNull();
    expect(voteMix({ votosTotais: 10, brancos: 1, nulos: null })).toBeNull();
    expect(voteMix({ votosTotais: 0, brancos: 0, nulos: 0 })).toBeNull();
    expect(voteMix({ votosTotais: 10, brancos: 8, nulos: 8 })).toBeNull();
  });
});
