import { describe, expect, it } from 'vitest';
import { seededRandom } from '@kizuna/core/client/marketing/sponsored-strip';
import { arrangeRail } from './sponsored-rail';

type Item = { uid: string; city: string; title: string; sponsor_slot?: number | null };
const item = (uid: string, city = 'Cuiabá', slot: number | null = null): Item => ({ uid, city, title: uid, sponsor_slot: slot });
const uids = (xs: Item[]) => xs.map((x) => x.uid);

// pool como o banco devolve: candidatos patrocinados no topo (railPool = 3)
const pool = [
  item('p1', 'Cuiabá', 1),
  item('p2', 'Várzea Grande', 2),
  item('p3', 'Cuiabá', 3),
  item('a'),
  item('b'),
  item('v1', 'Várzea Grande'),
  item('c'),
];

describe('arrangeRail (trilha da home com impulsionamento)', () => {
  it('HTML do servidor: 1 vaga patrocinada fixa no início, o resto pelo foco na cidade', () => {
    const out = arrangeRail(pool, { cityName: 'Cuiabá', limit: 4, arrange: 'city' }, 1);
    expect(out[0].uid).toBe('p1');
    expect(out[0].sponsor_slot).toBe(1);
    expect(out).toHaveLength(4);
    // limite por lista: só 1 patrocinado na trilha
    expect(out.filter((s) => (s.sponsor_slot ?? 0) > 0)).toHaveLength(1);
  });

  it('patrocinado de cidade irmã não é tirado da vaga pelo foco na cidade', () => {
    const only = [item('p2', 'Várzea Grande', 1), item('a'), item('b')];
    const out = arrangeRail(only, { cityName: 'Cuiabá', limit: 3, arrange: 'city' }, 1);
    expect(out[0].uid).toBe('p2');
  });

  it('rodízio por visita entre os candidatos (todos aparecem em alguma visita)', () => {
    const firsts = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      firsts.add(arrangeRail(pool, { cityName: 'Cuiabá', limit: 4 }, 1, { shuffle: true, rand: seededRandom(seed) })[0].uid);
    }
    expect([...firsts].sort()).toEqual(['p1', 'p2', 'p3']);
  });

  it('sem vagas (0): nenhum patrocinado ganha a frente', () => {
    const out = arrangeRail(pool, { cityName: null, limit: 3 }, 0);
    expect(uids(out)).toEqual(['a', 'b', 'v1']);
  });

  it('sem impulsionamento no pool: igual ao foco de sempre', () => {
    const plain = [item('a'), item('b'), item('c')];
    expect(uids(arrangeRail(plain, { cityName: null, limit: 2 }, 1))).toEqual(['a', 'b']);
  });
});
