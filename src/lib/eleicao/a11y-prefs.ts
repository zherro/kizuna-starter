// Preferência de acessibilidade da página /eleicao (tamanho da letra).
// Puro e defensivo: localStorage pode não existir, estar bloqueado ou conter lixo — nunca quebra.

export const PREFS_KEY = 'kizuna:eleicao:a11y:v1';

export type FontLevel = 0 | 1 | 2;
export type A11yPrefs = {
  /** 0 normal, 1 grande, 2 bem grande. */
  font: FontLevel;
};

export const DEFAULT_PREFS: A11yPrefs = { font: 0 };
export const FONT_SCALES = [1, 1.15, 1.3] as const;
export const MAX_FONT_LEVEL = 2;

type ReadStore = Pick<Storage, 'getItem'>;
type WriteStore = Pick<Storage, 'setItem'>;

function defaultStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null; // acesso ao localStorage pode lançar (cookies bloqueados, modo privado)
  }
}

/** Converte o texto salvo em preferências válidas; qualquer coisa inesperada vira o padrão. */
export function parsePrefs(raw: string | null | undefined): A11yPrefs {
  if (!raw) return { ...DEFAULT_PREFS };
  try {
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== 'object') return { ...DEFAULT_PREFS };
    const o = v as Record<string, unknown>;
    return { font: o.font === 1 || o.font === 2 ? o.font : 0 };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function loadPrefs(storage: ReadStore | null = defaultStorage()): A11yPrefs {
  try {
    return parsePrefs(storage?.getItem(PREFS_KEY));
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

/** Retorna false (sem lançar) quando não foi possível salvar. */
export function savePrefs(prefs: A11yPrefs, storage: WriteStore | null = defaultStorage()): boolean {
  try {
    if (!storage) return false;
    storage.setItem(PREFS_KEY, JSON.stringify(prefs));
    return true;
  } catch {
    return false;
  }
}

export function clampFont(n: number): FontLevel {
  return (n <= 0 ? 0 : n >= MAX_FONT_LEVEL ? MAX_FONT_LEVEL : Math.round(n)) as FontLevel;
}
