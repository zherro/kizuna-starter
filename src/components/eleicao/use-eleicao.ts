'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CaptchaRequired,
  fetchMeta,
  fetchScope,
  scopeKey,
  shouldFetchScope,
  type CachedScope,
} from '@/lib/eleicao/client';
import type { EleicaoMeta } from '@/lib/eleicao/normalize';

export type EleicaoScope = 'nacional' | 'uf';
export type Gate = 'none' | 'captcha' | 'wait';

const THROTTLE_WAIT_MS = 10_000;
const AUTO_REFRESH_MS = 60_000;
const MIN_RECHECK_MS = 5_000;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Lê `#uf=SP` (estadual) ou vazio (nacional) do hash da URL. */
export function parseHash(hash: string): { scope: EleicaoScope; uf: string | null } {
  const m = /^#uf=([A-Za-z]{2})$/.exec(hash);
  return m ? { scope: 'uf', uf: m[1].toUpperCase() } : { scope: 'nacional', uf: null };
}

export function useEleicao(enabled: boolean) {
  const [scope, setScopeState] = useState<EleicaoScope>('nacional');
  const [uf, setUfState] = useState<string | null>(null);
  const [meta, setMeta] = useState<EleicaoMeta | null>(null);
  const [cache, setCache] = useState<Record<string, CachedScope>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [lastCheck, setLastCheck] = useState<number | null>(null);
  const [gate, setGate] = useState<Gate>('none');
  const [captchaKey, setCaptchaKey] = useState(0);

  const cacheRef = useRef(cache);
  const metaRef = useRef(meta);
  const stateRef = useRef({ scope, uf });
  const inflight = useRef(false);
  const rerun = useRef(false);
  const lastCheckRef = useRef<number | null>(null);
  const captchaResolver = useRef<((token: string) => void) | null>(null);

  useEffect(() => {
    cacheRef.current = cache;
  }, [cache]);
  useEffect(() => {
    metaRef.current = meta;
  }, [meta]);
  useEffect(() => {
    stateRef.current = { scope, uf };
  }, [scope, uf]);

  const submitCaptcha = useCallback((token: string | null) => {
    if (token) captchaResolver.current?.(token);
  }, []);

  const withGate = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        return await fn();
      } catch (e) {
        if (!(e instanceof CaptchaRequired)) throw e;
        if (!e.captcha) {
          setGate('wait');
          await sleep(THROTTLE_WAIT_MS);
          setGate('none');
          continue;
        }
        setGate('captcha');
        const token = await new Promise<string>((resolve) => {
          captchaResolver.current = resolve;
        });
        captchaResolver.current = null;
        const res = await fetch('/api/eleicao/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ captchaToken: token }),
        }).catch(() => null);
        if (res?.ok) setGate('none');
        else setCaptchaKey((k) => k + 1); // novo widget para outra tentativa
      }
    }
    setGate('none');
    throw new Error('rate_limited');
  }, []);

  const refresh = useCallback(
    async (opts: { force?: boolean } = {}) => {
      if (inflight.current) {
        rerun.current = true;
        return;
      }
      inflight.current = true;
      setLoading(true);
      try {
        const { scope: sc, uf: selectedUf } = stateRef.current;
        const key = scopeKey(sc, selectedUf);
        const cached = cacheRef.current[key];
        const recent =
          lastCheckRef.current !== null && Date.now() - lastCheckRef.current < MIN_RECHECK_MS;
        if (!opts.force && cached && cached.data.status === 'ok' && recent) return;

        const m = await withGate(() => fetchMeta());
        setMeta(m);
        metaRef.current = m;

        let target = selectedUf;
        if (sc === 'uf' && !target) {
          target = m?.ufs.includes('SP') ? 'SP' : (m?.ufs[0] ?? null);
          if (target) {
            stateRef.current = { scope: sc, uf: target };
            setUfState(target);
          }
        }
        if (sc === 'uf' && !target) return;

        const k = scopeKey(sc, target);
        if (shouldFetchScope(cacheRef.current[k], m)) {
          const result = await withGate(() => fetchScope(sc, target));
          cacheRef.current = { ...cacheRef.current, [k]: result };
          setCache(cacheRef.current);
        }
        lastCheckRef.current = Date.now();
        setLastCheck(lastCheckRef.current);
        setError(false);
      } catch {
        setError(true);
      } finally {
        inflight.current = false;
        setLoading(false);
        if (rerun.current) {
          rerun.current = false;
          void refresh();
        }
      }
    },
    [withGate]
  );

  // Hash → estado (mount e navegação por hash).
  useEffect(() => {
    if (!enabled) return;
    const apply = () => {
      const h = parseHash(window.location.hash);
      setScopeState(h.scope);
      setUfState(h.uf);
      stateRef.current = h.scope === 'uf' ? { scope: 'uf', uf: h.uf ?? stateRef.current.uf } : h;
    };
    apply();
    window.addEventListener('hashchange', apply);
    return () => window.removeEventListener('hashchange', apply);
  }, [enabled]);

  // Carga inicial + a cada mudança de escopo/UF.
  useEffect(() => {
    if (enabled) void refresh();
  }, [enabled, scope, uf, refresh]);

  // Auto-refresh a cada 60s, só com a aba visível.
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh({ force: true });
    }, AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [enabled, refresh]);

  const writeHash = (s: EleicaoScope, u: string | null) => {
    const hash = s === 'uf' && u ? `#uf=${u}` : '';
    history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
  };

  const setScope = useCallback((next: EleicaoScope) => {
    const u = next === 'uf' ? (stateRef.current.uf ?? metaRef.current?.ufs.find((x) => x === 'SP') ?? metaRef.current?.ufs[0] ?? null) : null;
    stateRef.current = { scope: next, uf: u ?? stateRef.current.uf };
    setScopeState(next);
    if (next === 'uf') setUfState(u);
    writeHash(next, u);
  }, []);

  const setUf = useCallback((next: string) => {
    stateRef.current = { scope: 'uf', uf: next };
    setScopeState('uf');
    setUfState(next);
    writeHash('uf', next);
  }, []);

  const key = scopeKey(scope, uf);
  return {
    scope,
    uf,
    meta,
    current: cache[key] ?? null,
    loading,
    error,
    lastCheck,
    gate,
    captchaKey,
    submitCaptcha,
    setScope,
    setUf,
    refresh: () => refresh({ force: true }),
  };
}
