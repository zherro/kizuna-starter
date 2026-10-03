'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchDeputados, type DepQueryParams } from '@/lib/eleicao/client';
import type {
  Cargo,
  EleicaoDeputados,
  EleicaoCandidato,
  EleicaoTotalizacao,
  EleicaoTse,
  PartidoResumo,
} from '@/lib/eleicao/normalize';

export const DEP_PAGE_SIZE = 30;
export const DEP_ELEITOS_PAGE = 50;
/** Ao atualizar, refaz no máximo este número de páginas já carregadas. */
const REFRESH_PAGES = 3;
const CACHE_MAX = 60;

export type DepHead = {
  turno: number | null;
  tse: EleicaoTse | null;
  totalizacao: EleicaoTotalizacao;
  vagas: number | null;
  cargoNome: string | null;
};

type Status = 'idle' | 'loading' | 'ok' | 'waiting' | 'error';

export type DepList = {
  items: EleicaoCandidato[];
  total: number;
  /** Última página carregada. */
  page: number;
  moreLoading: boolean;
};

const EMPTY: DepList = { items: [], total: 0, page: 0, moreLoading: false };

type Gate = <T>(fn: () => Promise<T>) => Promise<T>;

export type UseDeputadosInput = {
  /** Só busca quando a aba está ativa e o cargo é de deputado com UF resolvida. */
  enabled: boolean;
  cargo: Cargo;
  uf: string | null;
  q: string;
  partido: string | null;
  /** Chave do TSE do cargo no meta: muda quando há dados novos. */
  tse: string | null;
  /** Sobe no "Atualizar" manual. */
  tick: number;
  withGate: Gate;
};

const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

/**
 * Lista paginada de deputados (e bloco "Eleitos agora"). Cada mudança de filtro cancela o
 * request anterior (AbortController); respostas ficam em cache por (TSE + URL) para que apagar
 * letras da busca não gaste o limite de 5 requisições/10s.
 */
export function useDeputados(inp: UseDeputadosInput) {
  const { enabled, cargo, uf, q, partido, tse, tick, withGate } = inp;
  const [status, setStatus] = useState<Status>('idle');
  const [head, setHead] = useState<DepHead | null>(null);
  const [list, setList] = useState<DepList>(EMPTY);
  const [partidos, setPartidos] = useState<PartidoResumo[]>([]);
  const [eleitos, setEleitos] = useState<DepList>(EMPTY);
  const [eleitosBusy, setEleitosBusy] = useState(false);

  const cacheRef = useRef(new Map<string, EleicaoDeputados | { status: 'aguardando' }>());
  const listCtl = useRef<AbortController | null>(null);
  const eleitosCtl = useRef<AbortController | null>(null);
  const moreCtl = useRef<AbortController | null>(null);
  const loadedKey = useRef('');
  const eleitosKey = useRef('');
  const headKey = useRef('');
  const listRef = useRef(list);
  const eleitosRef = useRef(eleitos);
  const lastTick = useRef(tick);
  const withGateRef = useRef(withGate);
  useEffect(() => {
    withGateRef.current = withGate;
    listRef.current = list;
    eleitosRef.current = eleitos;
  });

  const request = useCallback(
    async (params: DepQueryParams, signal: AbortSignal) => {
      const key = `${tse ?? ''}|${JSON.stringify(params)}`;
      const hit = cacheRef.current.get(key);
      if (hit) return hit;
      const res = await withGateRef.current(() => fetchDeputados(params, signal));
      if (!signal.aborted) {
        const c = cacheRef.current;
        if (c.size >= CACHE_MAX) c.delete(c.keys().next().value as string);
        c.set(key, res);
      }
      return res;
    },
    [tse]
  );

  const baseParams = useCallback(
    (extra: Partial<DepQueryParams>): DepQueryParams => ({
      cargo,
      uf: uf as string,
      q,
      partido,
      ...extra,
    }),
    [cargo, uf, q, partido]
  );

  // Lista principal: refaz quando UF/cargo/filtros/TSE (ou "Atualizar") mudam.
  useEffect(() => {
    if (!enabled || !uf) return;
    if (tick !== lastTick.current) {
      lastTick.current = tick;
      cacheRef.current.clear();
    }
    listCtl.current?.abort();
    moreCtl.current?.abort();
    const ctl = new AbortController();
    listCtl.current = ctl;
    const queryKey = `${cargo}|${uf}|${q}|${partido ?? ''}`;
    const sameQuery = loadedKey.current === queryKey;
    // Mesma consulta (novo TSE/Atualizar): mantém a lista na tela e refaz as páginas carregadas.
    const pages = sameQuery ? Math.min(Math.max(listRef.current.page, 1), REFRESH_PAGES) : 1;
    if (!sameQuery) {
      setStatus('loading');
      setList(EMPTY);
      if (headKey.current !== `${cargo}|${uf}`) {
        headKey.current = `${cargo}|${uf}`;
        setHead(null);
        setPartidos([]);
      }
    }

    (async () => {
      try {
        let first: EleicaoDeputados | null = null;
        const items: EleicaoCandidato[] = [];
        let page = 0;
        for (let p = 1; p <= pages; p++) {
          const r = await request(baseParams({ page: p, limit: DEP_PAGE_SIZE }), ctl.signal);
          if (r.status !== 'ok') {
            setStatus('waiting');
            return;
          }
          const d = r as EleicaoDeputados;
          first ??= d;
          items.push(...d.candidatos);
          page = p;
          if (items.length >= d.total) break;
        }
        if (ctl.signal.aborted || !first) return;
        loadedKey.current = queryKey;
        setHead({
          turno: first.turno,
          tse: first.tse,
          totalizacao: first.totalizacao,
          vagas: first.vagas,
          cargoNome: first.cargoNome ?? null,
        });
        setPartidos(first.partidos);
        setList({ items, total: first.total, page, moreLoading: false });
        setStatus('ok');
      } catch (e) {
        if (isAbort(e) || ctl.signal.aborted) return;
        setStatus('error');
      }
    })();
    return () => ctl.abort();
  }, [enabled, cargo, uf, q, partido, tse, tick, request, baseParams]);

  // Eleitos agora: por UF/cargo/TSE (não depende da busca).
  useEffect(() => {
    if (!enabled || !uf) return;
    eleitosCtl.current?.abort();
    const ctl = new AbortController();
    eleitosCtl.current = ctl;
    const ek = `${cargo}|${uf}`;
    if (eleitosKey.current !== ek) {
      eleitosKey.current = ek;
      setEleitos(EMPTY);
    }
    setEleitosBusy(true);
    (async () => {
      try {
        const r = await request(
          { cargo, uf, eleitos: true, page: 1, limit: DEP_ELEITOS_PAGE },
          ctl.signal
        );
        if (ctl.signal.aborted) return;
        if (r.status !== 'ok') setEleitos(EMPTY);
        else {
          const d = r as EleicaoDeputados;
          setEleitos({ items: d.candidatos, total: d.total, page: 1, moreLoading: false });
        }
      } catch (e) {
        if (!isAbort(e)) setEleitos(EMPTY);
      } finally {
        if (!ctl.signal.aborted) setEleitosBusy(false);
      }
    })();
    return () => ctl.abort();
  }, [enabled, cargo, uf, tse, tick, request]);

  const loadMore = useCallback(async () => {
    const cur = listRef.current;
    if (!uf || cur.moreLoading || cur.items.length >= cur.total) return;
    moreCtl.current?.abort();
    const ctl = new AbortController();
    moreCtl.current = ctl;
    setList((l) => ({ ...l, moreLoading: true }));
    try {
      const r = await request(baseParams({ page: cur.page + 1, limit: DEP_PAGE_SIZE }), ctl.signal);
      if (ctl.signal.aborted) return;
      if (r.status !== 'ok') {
        setList((l) => ({ ...l, moreLoading: false }));
        return;
      }
      const d = r as EleicaoDeputados;
      setList((l) => {
        const seen = new Set(l.items.map((c) => c.sqcand || `s${c.seq}`));
        const add = d.candidatos.filter((c) => !seen.has(c.sqcand || `s${c.seq}`));
        return { items: [...l.items, ...add], total: d.total, page: cur.page + 1, moreLoading: false };
      });
    } catch (e) {
      if (!isAbort(e)) setList((l) => ({ ...l, moreLoading: false }));
    }
  }, [uf, request, baseParams]);

  const loadMoreEleitos = useCallback(async () => {
    const cur = eleitosRef.current;
    if (!uf || cur.moreLoading || cur.items.length >= cur.total) return;
    const ctl = new AbortController();
    setEleitos((l) => ({ ...l, moreLoading: true }));
    try {
      const r = await request(
        { cargo, uf, eleitos: true, page: cur.page + 1, limit: DEP_ELEITOS_PAGE },
        ctl.signal
      );
      if (r.status !== 'ok') throw new Error('x');
      const d = r as EleicaoDeputados;
      setEleitos((l) => ({
        items: [...l.items, ...d.candidatos],
        total: d.total,
        page: cur.page + 1,
        moreLoading: false,
      }));
    } catch {
      setEleitos((l) => ({ ...l, moreLoading: false }));
    }
  }, [cargo, uf, request]);

  return {
    status,
    head,
    list,
    partidos,
    eleitos,
    busy: status === 'loading' || list.moreLoading || eleitosBusy,
    loadMore,
    loadMoreEleitos,
  };
}
