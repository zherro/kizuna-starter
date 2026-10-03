import { describe, expect, it } from 'vitest';
import { CARGOS } from '../../src/lib/eleicao/normalize';
import {
  UF_NAMES,
  cargoEnabled,
  isNational,
  formatClock,
  isDistrital,
  needsSelection,
  sortUfs,
  stepPlan,
  ufLabel,
} from '../../src/lib/eleicao/steps';
import { ELECTION_EN_US, ELECTION_ES_ES, ELECTION_PT_BR } from '../../src/i18n/election-messages';

describe('ordem dos passos', () => {
  it('Brasil (so Presidente): 1 onde ver, 2 cargo; sem passo de estado', () => {
    expect(stepPlan('presidente', 'nacional')).toEqual([
      { id: 'scope', n: 1 },
      { id: 'cargo', n: 2 },
    ]);
  });
  it('por estado: 1 onde ver, 2 estado, 3 cargo', () => {
    expect(stepPlan('presidente', 'uf').map((s) => `${s.n}${s.id}`)).toEqual(['1scope', '2state', '3cargo']);
    for (const c of CARGOS.filter((c) => c !== 'presidente')) {
      expect(stepPlan(c, 'uf').map((s) => s.id)).toEqual(['scope', 'state', 'cargo']);
    }
  });
  it('no Brasil so o Presidente esta habilitado; por estado todos', () => {
    for (const c of CARGOS) {
      expect(cargoEnabled(c, 'presidente', 'nacional')).toBe(c === 'presidente');
      expect(cargoEnabled(c, 'presidente', 'uf')).toBe(true);
      expect(cargoEnabled(c, 'governador', 'uf')).toBe(true);
    }
    expect(isNational('governador', 'nacional')).toBe(false);
  });
});

describe('passo sem selecao', () => {
  it('estadual sem estado pede a escolha; com estado nao', () => {
    expect(needsSelection('governador', 'uf', null)).toBe(true);
    expect(needsSelection('governador', 'uf', 'SP')).toBe(false);
    expect(needsSelection('presidente', 'uf', null)).toBe(true);
  });
  it('presidente no Brasil nunca precisa de estado', () => {
    expect(needsSelection('presidente', 'nacional', null)).toBe(false);
  });
});

describe('rotulos de cargo e estado', () => {
  it('DF vira Deputado Distrital; outros estados seguem Estadual', () => {
    expect(isDistrital('deputado-estadual', 'DF')).toBe(true);
    expect(isDistrital('deputado-estadual', 'SP')).toBe(false);
    expect(isDistrital('deputado-federal', 'DF')).toBe(false);
    for (const t of [ELECTION_PT_BR, ELECTION_EN_US, ELECTION_ES_ES]) {
      expect(t.cargoDeputadoDistrital).toBeTruthy();
      expect(t.cargoDeputadoDistrital).not.toBe(t.cargoDeputadoEstadual);
    }
    expect(ELECTION_PT_BR.cargoDeputadoDistrital).toBe('Deputado Distrital');
  });
  it('nome completo do estado e Exterior', () => {
    expect(ufLabel('SP', 'Exterior')).toBe('São Paulo (SP)');
    expect(ufLabel('ZZ', 'Exterior')).toBe('Exterior');
    expect(Object.keys(UF_NAMES)).toHaveLength(27);
  });
  it('ordena por nome completo e deixa Exterior por ultimo', () => {
    expect(sortUfs(['SP', 'ZZ', 'AC', 'AM', 'BA'])).toEqual(['AC', 'AM', 'BA', 'SP', 'ZZ']);
  });
});

describe('textos novos', () => {
  it('as tres linguas tem as mesmas chaves e os textos principais pedidos', () => {
    const keys = Object.keys(ELECTION_PT_BR).sort();
    expect(Object.keys(ELECTION_EN_US).sort()).toEqual(keys);
    expect(Object.keys(ELECTION_ES_ES).sort()).toEqual(keys);
    expect(ELECTION_PT_BR.stepCargoTitle).toBe('Cargo');
    expect(ELECTION_PT_BR.stepScopeTitle).toBe('Onde ver');
    expect(ELECTION_PT_BR.onlyByState).toBe('só disponível por estado');
    expect(ELECTION_PT_BR.statePlaceholder).toBe('Escolha um estado');
    expect(ELECTION_PT_BR.pickTitle).toBe('Escolha um estado para ver os resultados');
    expect(ELECTION_PT_BR.refresh).toBe('Atualizar resultados');
    expect(ELECTION_PT_BR.tabTse).toBe('Painel oficial do TSE');
    expect(ELECTION_PT_BR.urnsCounted).toContain('urnas');
  });
});

describe('hora local', () => {
  it('formata HH:MM com zero a esquerda', () => {
    expect(formatClock(new Date(2026, 9, 4, 8, 5).getTime())).toBe('08:05');
    expect(formatClock(new Date(2026, 9, 4, 18, 32).getTime())).toBe('18:32');
  });
});
