import { describe, it, expect } from 'vitest';
import { MAP_ICONS } from '@kizuna/core/client/components/map';
import { MAP_CENTER, MAP_GROUP_STYLES } from './mapa';

describe('config do mapa', () => {
  it('abre em Cuiabá', () => {
    expect(MAP_CENTER.lat).toBeCloseTo(-15.6, 1);
    expect(MAP_CENTER.lng).toBeCloseTo(-56.1, 1);
  });

  it('todo grupo usa um ícone que existe no core e tem legenda e cor', () => {
    for (const style of Object.values(MAP_GROUP_STYLES)) {
      expect(Object.keys(MAP_ICONS)).toContain(style.icon);
      expect(style.label).not.toBe('');
      expect(style.color).not.toBe('');
    }
  });
});
