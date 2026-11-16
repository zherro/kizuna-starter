import { describe, expect, it } from 'vitest';
import { focusOnCity, seededShuffle } from './city-focus';

const it_ = (title: string, city: string) => ({ title, city });
const cities = (r: { items: { city: string }[] }) => r.items.map((i) => i.city[0]).join('');

describe('focusOnCity', () => {
  // 15 de Cuiabá (C) e 5 de Várzea Grande (V), em ordem de data misturada
  const eventos = Array.from({ length: 20 }, (_, i) => it_(`ev${i}`, i % 4 === 3 ? 'Várzea Grande' : 'Cuiabá'));

  it('página de Cuiabá: Cuiabá tem preferência, VG garante ~30% dos cards', () => {
    const r = focusOnCity(eventos, { cityName: 'Cuiabá', limit: 10 });
    expect(r.ownCount).toBe(7);
    expect(r.sisterCount).toBe(3);
    expect(r.items).toHaveLength(10);
    expect(r.hasMore).toBe(true);
  });

  it('página de VG: VG ocupa o que tem e Cuiabá completa', () => {
    const r = focusOnCity(eventos, { cityName: 'Várzea Grande', limit: 10 });
    expect(r.ownCount).toBe(5);
    expect(r.sisterCount).toBe(5);
  });

  it('"keep" mantém a ordem de entrada (data) entre os escolhidos', () => {
    const r = focusOnCity(eventos, { cityName: 'Cuiabá', limit: 10, arrange: 'keep' });
    const idx = r.items.map((i) => Number(i.title.slice(2)));
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
  });

  it('"city": 1º card é da cidade escolhida e as irmãs entram a cada 3', () => {
    const r = focusOnCity(eventos, { cityName: 'Cuiabá', limit: 9, arrange: 'city' });
    expect(cities(r)).toBe('CCVCCVCCV');
  });

  it('mosaico pequeno (4): 1 vaga para a irmã, não metade', () => {
    const r = focusOnCity(eventos, { cityName: 'Cuiabá', limit: 4, arrange: 'city' });
    expect(cities(r)).toBe('CCVC');
  });

  it('cidade sem conteúdo: a trilha fica toda com as irmãs', () => {
    const r = focusOnCity([it_('a', 'Cuiabá'), it_('b', 'Cuiabá')], { cityName: 'Várzea Grande', limit: 10 });
    expect(r.items.map((i) => i.title)).toEqual(['a', 'b']);
    expect(r.ownCount).toBe(0);
  });

  it('irmã sem conteúdo: a trilha fica toda com a cidade', () => {
    const r = focusOnCity(eventos.filter((e) => e.city === 'Cuiabá'), { cityName: 'Cuiabá', limit: 10 });
    expect(r.ownCount).toBe(10);
  });

  it('cinema: um card por filme, o da cidade escolhida; o da irmã só se faltar na cidade', () => {
    const filmes = [
      it_('Duna - Parte 3', 'Cuiabá'),
      it_('Duna - Parte 3', 'Várzea Grande'),
      it_('Vingadores', 'Várzea Grande'),
      it_('Vingadores', 'Cuiabá'),
      it_('Só em VG', 'Várzea Grande'),
    ];
    const vg = focusOnCity(filmes, { cityName: 'Várzea Grande', limit: 10, dedupeTitle: true, arrange: 'city' });
    expect(vg.items).toEqual([it_('Duna - Parte 3', 'Várzea Grande'), it_('Vingadores', 'Várzea Grande'), it_('Só em VG', 'Várzea Grande')]);
    const cba = focusOnCity(filmes, { cityName: 'Cuiabá', limit: 10, dedupeTitle: true, arrange: 'city' });
    expect(cba.items).toEqual([it_('Duna - Parte 3', 'Cuiabá'), it_('Vingadores', 'Cuiabá'), it_('Só em VG', 'Várzea Grande')]);
  });

  it('compara cidade e título sem acento e sem caixa', () => {
    const r = focusOnCity([it_('DUNA', 'cuiaba'), it_('Duna', 'Cuiabá ')], { cityName: 'Cuiabá', limit: 5, dedupeTitle: true });
    expect(r.items).toHaveLength(1);
    expect(r.ownCount).toBe(1);
  });

  it('sem cidade (home global): só corta e tira repetidos', () => {
    const r = focusOnCity(eventos, { cityName: null, limit: 4 });
    expect(r.items.map((i) => i.title)).toEqual(['ev0', 'ev1', 'ev2', 'ev3']);
  });
});

describe('seededShuffle', () => {
  it('é estável para a mesma semente e não perde itens', () => {
    const base = Array.from({ length: 12 }, (_, i) => i);
    expect(seededShuffle(base, '2026-11-16:cuiaba')).toEqual(seededShuffle(base, '2026-11-16:cuiaba'));
    expect([...seededShuffle(base, 'x')].sort((a, b) => a - b)).toEqual(base);
  });
});
