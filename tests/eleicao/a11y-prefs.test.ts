import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PREFS,
  FONT_SCALES,
  PREFS_KEY,
  clampFont,
  loadPrefs,
  parsePrefs,
  savePrefs,
} from '../../src/lib/eleicao/a11y-prefs';

const memory = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
};

describe('preferencias de acessibilidade', () => {
  it('padrao: letra normal', () => {
    expect(DEFAULT_PREFS).toEqual({ font: 0 });
    expect(loadPrefs(memory())).toEqual(DEFAULT_PREFS);
  });

  it('tres niveis de letra, em escala crescente', () => {
    expect(FONT_SCALES).toHaveLength(3);
    expect(FONT_SCALES[0]).toBe(1);
    expect(FONT_SCALES[1]).toBeGreaterThan(FONT_SCALES[0]);
    expect(FONT_SCALES[2]).toBeGreaterThan(FONT_SCALES[1]);
    expect([clampFont(-3), clampFont(1), clampFont(9)]).toEqual([0, 1, 2]);
  });

  it('salva e le de volta', () => {
    const st = memory();
    expect(savePrefs({ font: 2 }, st)).toBe(true);
    expect(loadPrefs(st)).toEqual({ font: 2 });
  });

  it('localStorage que lanca nao quebra (leitura e escrita)', () => {
    const broken = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(loadPrefs(broken)).toEqual(DEFAULT_PREFS);
    expect(savePrefs({ font: 1 }, broken)).toBe(false);
  });

  it('sem localStorage (null / indisponivel) nao quebra', () => {
    expect(loadPrefs(null)).toEqual(DEFAULT_PREFS);
    expect(savePrefs(DEFAULT_PREFS, null)).toBe(false);
    // ambiente node: o padrao interno nao existe e tambem nao lanca
    expect(() => loadPrefs()).not.toThrow();
    expect(() => savePrefs(DEFAULT_PREFS)).not.toThrow();
  });

  it('valor salvo corrompido ou fora do esperado volta ao padrao', () => {
    for (const raw of ['', 'xyz', '{', 'null', '[]', '"a"', JSON.stringify({ font: 99 })]) {
      expect(parsePrefs(raw)).toEqual(DEFAULT_PREFS);
    }
    const st = memory();
    st.setItem(PREFS_KEY, '{lixo');
    expect(loadPrefs(st)).toEqual(DEFAULT_PREFS);
  });
});
