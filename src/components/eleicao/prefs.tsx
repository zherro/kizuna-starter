'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_PREFS,
  FONT_SCALES,
  MAX_FONT_LEVEL,
  clampFont,
  loadPrefs,
  savePrefs,
  type A11yPrefs,
} from '@/lib/eleicao/a11y-prefs';

export type PrefsApi = {
  prefs: A11yPrefs;
  fontScale: number;
  setFont: (delta: 1 | -1) => void;
  canSmaller: boolean;
  canLarger: boolean;
};

const Ctx = createContext<PrefsApi | null>(null);

/** Preferências de acessibilidade da página: lidas do localStorage depois de montar (sem quebrar o SSR). */
export function useA11yPrefsState(): PrefsApi {
  const [prefs, setPrefs] = useState<A11yPrefs>(DEFAULT_PREFS);

  useEffect(() => {
    setPrefs(loadPrefs());
  }, []);

  const update = useCallback((fn: (p: A11yPrefs) => A11yPrefs) => {
    setPrefs((p) => {
      const next = fn(p);
      savePrefs(next); // falha silenciosa: a preferência vale ao menos nesta visita
      return next;
    });
  }, []);

  return useMemo(
    () => ({
      prefs,
      fontScale: FONT_SCALES[prefs.font],
      setFont: (d) => update((p) => ({ ...p, font: clampFont(p.font + d) })),
      canSmaller: prefs.font > 0,
      canLarger: prefs.font < MAX_FONT_LEVEL,
    }),
    [prefs, update]
  );
}

export const PrefsProvider = Ctx.Provider;

/** Fora do provider (testes/outras telas) devolve o padrão: letra normal. */
export function useA11yPrefs(): PrefsApi {
  const v = useContext(Ctx);
  if (v) return v;
  return {
    prefs: DEFAULT_PREFS,
    fontScale: 1,
    setFont: () => {},
    canSmaller: false,
    canLarger: true,
  };
}
