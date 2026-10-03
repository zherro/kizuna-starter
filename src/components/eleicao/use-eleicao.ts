'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CaptchaRequired,
  fetchMeta,
  fetchScope,
  scopeKey,
  shouldFetchScope,
  type CachedScope,
  type EleicaoScopeKind,
} from '@/lib/eleicao/client';
import { positionMoves } from '@/lib/eleicao/dynamics';
import { isCargo, isDeputado, type Cargo, type EleicaoMeta } from '@/lib/eleicao/normalize';

export type { EleicaoScopeKind as EleicaoScope } from '@/lib/eleicao/client';
export type Gate = 'none' | 'captcha' | 'wait';

type View = {
  cargo: Cargo;
  scope: EleicaoScopeKind;
  uf: string | null;
  /** Busca e partido: só deputados (filtram no servidor). */
  q: string;
  partido: string | null;
};

export const MAX_Q = 60;
const PARTIDO_RE = /^[A-Za-z0-9 ./-]{1,20}$/;

const THROTTLE_WAIT_MS = 10_000;
const AUTO_REFRESH_MS = 60_000;
const MIN_RECHECK_MS = 5_000;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Lê o hash da URL: `#cargo=senador&uf=SP` (deputados: `&q=texto&partido=XYZ`). Sem cargo =
 * presidente; sem UF = nacional (só presidente). Os demais cargos são sempre estaduais.
 */
export function parseHash(hash: string): View {
  const q = new URLSearchParams(hash.replace(/^#/, ''));
  const rawCargo = q.get('cargo');
  const cargo: Cargo = isCargo(rawCargo) ? rawCargo : 'presidente';
  const rawUf = q.get('uf');
  const uf = rawUf && /^[A-Za-z]{2}$/.test(rawUf) ? rawUf.toUpperCase() : null;
  if (cargo === 'presidente') return { cargo, scope: uf ? 'uf' : 'nacional', uf, q: '', partido: null };
  if (!isDeputado(cargo)) return { cargo, scope: 'uf', uf, q: '', partido: null };
  const rawQ = (q.get('q') ?? '').trim().slice(0, MAX_Q);
  const rawP = q.get('partido');
  return { cargo, scope: 'uf', uf, q: rawQ, partido: rawP && PARTIDO_RE.test(rawP) ? rawP : null };
}

export function buildHash({ cargo, scope, uf, q: qs, partido }: View): string {
  const q = new URLSearchParams();
  if (cargo !== 'presidente') q.set('cargo', cargo);
  if (scope === 'uf' && uf) q.set('uf', uf);
  if (isDeputado(cargo)) {
    if (qs) q.set('q', qs);
    if (partido) q.set('partido', partido);
  }
  const s = q.toString();
  return s ? `#${s}` : '';
}

export function useEleicao(enabled: boolean) {
  const [view, setViewState] = useState<View>({
    cargo: 'presidente',
    scope: 'nacional',
    uf: null,
    q: '',
    partido: null,
  });
  const [meta, setMeta] = useState<EleicaoMeta | null>(null);
  const [cache, setCache] = useState<Record<string, CachedScope>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [lastCheck, setLastCheck] = useState<number | null>(null);
  const [gate, setGate] = useState<Gate>('none');
  const [captchaKey, setCaptchaKey] = useState(0);
  /** Sobe a cada "Atualizar" manual: deputados refazem a página atual mesmo sem novo TSE. */
  const [manualTick, setManualTick] = useState(0);

  const cacheRef = useRef(cache);
  const metaRef = useRef(meta);
  const viewRef = useRef(view);
  const lastPresScope = useRef<EleicaoScopeKind>('nacional');
  const inflight = useRef(false);
  const rerun = useRef(false);
  const lastCheckRef = useRef<number | null>(null);
  const lastMetaAt = useRef(0);
  const captchaResolver = useRef<((token: string) => void) | null>(null);

  useEffect(() => {
    cacheRef.current = cache;
  }, [cache]);
  useEffect(() => {
    metaRef.current = meta;
  }, [meta]);

  const applyView = useCallback((next: View, writeUrl: boolean) => {
    viewRef.current = next;
    setViewState(next);
    if (next.cargo === 'presidente') lastPresScope.current = next.scope;
    if (writeUrl) {
      history.replaceState(
        null,
        '',
        `${window.location.pathname}${window.location.search}${buildHash(next)}`
      );
    }
  }, []);

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
    async (opts: { force?: boolean; manual?: boolean } = {}) => {
      if (inflight.current) {
        rerun.current = true;
        return;
      }
      inflight.current = true;
      setLoading(true);
      try {
        const { cargo, scope, uf: selectedUf } = viewRef.current;
        const key = scopeKey(cargo, scope, selectedUf);
        const cached = cacheRef.current[key];
        const recent =
          lastCheckRef.current !== null && Date.now() - lastCheckRef.current < MIN_RECHECK_MS;
        if (!opts.force && cached && cached.data.status === 'ok' && recent) return;

        // 1) meta (barato): diz se o TSE publicou algo novo para este cargo.
        // Troca de cargo/UF logo após uma leitura reaproveita o meta (1 request em vez de 2);
        // Atualizar e o auto-refresh (force) sempre buscam o meta de novo.
        const metaFresh =
          !opts.force && metaRef.current !== null && Date.now() - lastMetaAt.current < MIN_RECHECK_MS;
        let m = metaRef.current;
        if (!metaFresh) {
          m = await withGate(() => fetchMeta());
          lastMetaAt.current = Date.now();
          setMeta(m);
          metaRef.current = m;
        }

        const cargoUfs = m?.cargos[cargo]?.ufs ?? [];
        let target = selectedUf;
        if (scope === 'uf') {
          // UF sem arquivo neste cargo (ex.: Exterior no Senador): limpa e pede nova escolha.
          // Nunca escolhe um estado sozinho: quem decide é a pessoa (passo "Escolha o estado").
          if (target && cargoUfs.length > 0 && !cargoUfs.includes(target)) {
            target = null;
            applyView({ ...viewRef.current, cargo, scope, uf: null }, true);
          }
          if (!target) {
            lastCheckRef.current = Date.now();
            setLastCheck(lastCheckRef.current);
            setError(false);
            return;
          }
        }

        // Deputados: a lista paginada é buscada por useDeputados (reage a UF/filtros/TSE do meta).
        if (isDeputado(cargo)) {
          if (opts.manual) setManualTick((t) => t + 1);
          lastCheckRef.current = Date.now();
          setLastCheck(lastCheckRef.current);
          setError(false);
          return;
        }

        // 2) dados do escopo, só se mudou.
        const k = scopeKey(cargo, scope, target);
        const prev = cacheRef.current[k];
        if (shouldFetchScope(prev, m, cargo)) {
          const result = await withGate(() => fetchScope(cargo, scope, target));
          if (prev?.data.status === 'ok' && result.data.status === 'ok') {
            // Só marca setas quando algo mudou de verdade (senão limpa).
            result.moves = positionMoves(prev.data.candidatos, result.data.candidatos);
          }
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
    [withGate, applyView]
  );

  // Hash → estado (mount e navegação por hash).
  useEffect(() => {
    if (!enabled) return;
    const apply = () => applyView(parseHash(window.location.hash), false);
    apply();
    window.addEventListener('hashchange', apply);
    return () => window.removeEventListener('hashchange', apply);
  }, [enabled, applyView]);

  // Carga inicial + a cada mudança de cargo/escopo/UF.
  useEffect(() => {
    if (enabled) void refresh();
  }, [enabled, view.cargo, view.scope, view.uf, refresh]);

  // Auto-refresh a cada 60s, só com a aba visível.
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh({ force: true });
    }, AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [enabled, refresh]);

  const setCargo = useCallback(
    (next: Cargo) => {
      const cur = viewRef.current;
      if (next === cur.cargo) return;
      if (next === 'presidente') {
        const scope = lastPresScope.current;
        applyView(
          { cargo: next, scope, uf: scope === 'uf' ? cur.uf : null, q: '', partido: null },
          true
        );
        return;
      }
      const ufs = metaRef.current?.cargos[next]?.ufs ?? [];
      // Mantém o estado já escolhido se ele existe neste cargo; senão pede a escolha.
      const uf = cur.uf && (ufs.length === 0 || ufs.includes(cur.uf)) ? cur.uf : null;
      applyView({ cargo: next, scope: 'uf', uf, q: '', partido: null }, true);
    },
    [applyView]
  );

  const setScope = useCallback(
    (next: EleicaoScopeKind) => {
      const cur = viewRef.current;
      if (cur.cargo !== 'presidente') return;
      const uf = cur.uf;
      applyView({ cargo: 'presidente', scope: next, uf, q: '', partido: null }, true);
    },
    [applyView]
  );

  const setUf = useCallback(
    (next: string) => {
      const cur = viewRef.current;
      applyView({ cargo: cur.cargo, scope: 'uf', uf: next, q: '', partido: null }, true);
    },
    [applyView]
  );

  /** Busca/partido dos deputados (vão para o hash; não refazem o meta). */
  const setFilters = useCallback(
    (f: { q?: string; partido?: string | null }) => {
      const cur = viewRef.current;
      const q = (f.q ?? cur.q).slice(0, MAX_Q);
      const partido = f.partido === undefined ? cur.partido : f.partido;
      if (q === cur.q && partido === cur.partido) return;
      applyView({ ...cur, q, partido }, true);
    },
    [applyView]
  );

  const key = scopeKey(view.cargo, view.scope, view.uf);
  return {
    cargo: view.cargo,
    scope: view.scope,
    uf: view.uf,
    q: view.q,
    partido: view.partido,
    manualTick,
    withGate,
    meta,
    current: cache[key] ?? null,
    loading,
    error,
    lastCheck,
    gate,
    captchaKey,
    submitCaptcha,
    setCargo,
    setScope,
    setUf,
    setFilters,
    refresh: () => refresh({ force: true, manual: true }),
  };
}
