'use client';

import { memo, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Check, Loader2, Search, SearchX, X } from 'lucide-react';
import { useAppPreferences } from '@kizuna/core/client/providers/app-preferences-provider';
import { compactVotes, toneFor } from '@/lib/eleicao/dynamics';
import {
  formatPct,
  formatVotes,
  type Cargo,
  type EleicaoCandidato,
  type PartidoResumo,
} from '@/lib/eleicao/normalize';
import { Avatar } from './candidate-card';
import { MAX_Q } from './use-eleicao';
import type { useDeputados } from './use-deputados';

type Dep = ReturnType<typeof useDeputados>;

const ELEITOS_PREVIEW = 10;
const SEARCH_DEBOUNCE_MS = 300;
const PARTIES_PREVIEW = 6;

function fill(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}

type Props = {
  dep: Dep;
  cargo: Cargo;
  uf: string;
  q: string;
  partido: string | null;
  onFilters: (f: { q?: string; partido?: string | null }) => void;
  waiting: boolean;
  error: boolean;
  onRetry: () => void;
};

export function DeputadosView({ dep, cargo, uf, q, partido, onFilters, waiting, error, onRetry }: Props) {
  const { messages } = useAppPreferences();
  const t = messages.election;
  const vagas = dep.head?.vagas ?? null;
  const filtered = Boolean(q || partido);

  if (dep.status === 'waiting' || (waiting && dep.status !== 'ok')) {
    return null; // o painel mostra "Aguardando apuração"
  }

  return (
    <div className="el-swap" key={`${cargo}-${uf}`}>
      <ElectedBlock dep={dep} cargo={cargo} uf={uf} vagas={vagas} />
      {dep.partidos.length > 0 && (
        <PartyStrip partidos={dep.partidos} active={partido} onPick={(p) => onFilters({ partido: p })} />
      )}
      <div className="lg:hidden">
        <SearchBar q={q} partido={partido} partidos={dep.partidos} onFilters={onFilters} />
      </div>

      {dep.status === 'error' || (error && dep.status === 'idle') ? (
        <div role="alert" className="el-card p-6 text-center">
          <p className="text-lg font-medium">{t.errorText}</p>
          <button type="button" onClick={onRetry} className="el-btn mt-4">
            {t.retry}
          </button>
        </div>
      ) : dep.status === 'loading' || dep.status === 'idle' ? (
        <>
          <p role="status" className="mb-3 flex items-center gap-3 text-lg font-medium">
            <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
            {t.loadingResults}
          </p>
          <RowSkeletons />
        </>
      ) : dep.list.items.length === 0 ? (
        <div className="el-card p-6 text-center">
          <SearchX className="mx-auto mb-2 h-9 w-9" aria-hidden="true" />
          <p className="font-display text-xl font-semibold">{t.noResults}</p>
          <p className="mt-1 text-base text-muted-foreground">{t.noResultsHint}</p>
          {filtered && (
            <button
              type="button"
              onClick={() => onFilters({ q: '', partido: null })}
              className="el-tool mx-auto mt-4 justify-center"
            >
              {t.clearFilters}
            </button>
          )}
        </div>
      ) : (
        <>
          <p className="mb-2 text-base font-medium tabular-nums text-muted-foreground" aria-live="polite">
            {fill(t.showing, { n: formatVotes(dep.list.items.length), total: formatVotes(dep.list.total) })}
          </p>
          <ol aria-label={t.rankingLabel} className="el-grid">
            {dep.list.items.map((c) => (
              <DepRow
                key={c.sqcand || `s${c.seq}`}
                c={c}
                cargo={cargo}
                uf={uf}
                seat={vagas !== null && (c.pos ?? 0) <= vagas}
                maxVotes={dep.list.items[0]?.votos || 1}
              />
            ))}
          </ol>
          {dep.list.items.length < dep.list.total && (
            <button
              type="button"
              onClick={dep.loadMore}
              disabled={dep.list.moreLoading}
              className="el-btn mx-auto mt-4 w-full sm:w-auto"
            >
              {dep.list.moreLoading && <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />}
              {dep.list.moreLoading ? t.loadingMore : t.loadMore}
            </button>
          )}
        </>
      )}
    </div>
  );
}

/** "Eleitos agora (N vagas)": os primeiros em linhas compactas; "ver todos" expande. */
function ElectedBlock({ dep, cargo, uf, vagas }: { dep: Dep; cargo: Cargo; uf: string; vagas: number | null }) {
  const { messages } = useAppPreferences();
  const t = messages.election;
  const [open, setOpen] = useState(false);
  const { items, total } = dep.eleitos;
  if (total === 0 && !dep.eleitos.moreLoading) return null;
  const n = vagas ?? total;
  const shown = open ? items : items.slice(0, ELEITOS_PREVIEW);
  const maxVotes = items[0]?.votos || 1;
  return (
    <section
      aria-labelledby="el-elected-title"
      className="el-card el-rise mb-3 p-3"
    >
      <h3 id="el-elected-title" className="mb-1.5 font-display text-lg font-semibold leading-tight">
        {fill(n === 1 ? t.electedNowOne : t.electedNow, { n })}
      </h3>
      <ol aria-label={t.rankingLabel} className="el-grid" data-compact="">
        {shown.map((c) => (
          <DepRow key={c.sqcand || `s${c.seq}`} c={c} cargo={cargo} uf={uf} seat compact maxVotes={maxVotes} />
        ))}
      </ol>
      {(total > ELEITOS_PREVIEW || open) && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="el-tool justify-center font-medium"
          >
            {open ? t.showLess : t.showAllElected}
          </button>
          {open && items.length < total && (
            <button
              type="button"
              onClick={dep.loadMoreEleitos}
              disabled={dep.eleitos.moreLoading}
              className="el-tool justify-center font-medium"
            >
              {dep.eleitos.moreLoading ? t.loadingMore : t.loadMore}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/** Resumo por partido: botões em grade (sem rolar para o lado); tocar filtra. Mostra os maiores e "ver todos". */
function PartyStrip({
  partidos,
  active,
  onPick,
}: {
  partidos: PartidoResumo[];
  active: string | null;
  onPick: (sigla: string | null) => void;
}) {
  const { messages } = useAppPreferences();
  const t = messages.election;
  const [all, setAll] = useState(false);
  const max = partidos[0]?.votos || 1;
  const list = all ? partidos : partidos.slice(0, PARTIES_PREVIEW);
  return (
    <section aria-labelledby="el-parties-title" className="mb-3">
      <h3 id="el-parties-title" className="mb-1.5 font-display text-lg font-semibold leading-tight">
        {t.partiesTitle}
      </h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {list.map((p) => {
          const on = active?.toLowerCase() === p.sigla.toLowerCase();
          return (
            <button
              key={p.sigla}
              type="button"
              aria-pressed={on}
              onClick={() => onPick(on ? null : p.sigla)}
              className="el-chip flex min-h-14 flex-col items-start rounded-2xl px-3 py-2 text-left"
            >
              <span className="flex w-full items-center justify-between gap-1">
                <span className="font-display text-lg font-semibold leading-none">{p.sigla}</span>
                {on ? (
                  <Check className="h-5 w-5 shrink-0" strokeWidth={3.5} aria-hidden="true" />
                ) : (
                  p.eleitos > 0 && <span className="el-pill px-2 text-base leading-none">{p.eleitos}</span>
                )}
              </span>
              <span className="mt-1 text-base leading-tight tabular-nums">
                {compactVotes(p.votos)} {t.votes}
              </span>
              <span className="el-track mt-1.5 h-2 w-full" aria-hidden="true">
                <span
                  className="block h-full"
                  style={{ width: `${Math.max(3, (p.votos / max) * 100)}%`, background: 'var(--el-bar)' }}
                />
              </span>
              <span className="sr-only">{fill(t.partyElected, { n: p.eleitos })}</span>
            </button>
          );
        })}
      </div>
      {partidos.length > PARTIES_PREVIEW && (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          aria-expanded={all}
          className="el-tool mt-2 w-full justify-center font-medium sm:w-auto"
        >
          {all ? t.partiesShowLess : fill(t.partiesShowAll, { n: partidos.length })}
        </button>
      )}
    </section>
  );
}

/** Busca (espera 300ms ao digitar) + filtro de partido, com rótulos sempre visíveis. */
export function SearchBar({
  q,
  partido,
  partidos,
  onFilters,
}: {
  q: string;
  partido: string | null;
  partidos: PartidoResumo[];
  onFilters: (f: { q?: string; partido?: string | null }) => void;
}) {
  const { messages } = useAppPreferences();
  const t = messages.election;
  const [text, setText] = useState(q);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [uid] = useState(() => Math.random().toString(36).slice(2, 7));

  // Mudança externa (hash, troca de UF/cargo): sincroniza o campo.
  useEffect(() => setText(q), [q]);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const change = (v: string) => {
    setText(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onFilters({ q: v.trim() }), SEARCH_DEBOUNCE_MS);
  };
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    setText('');
    onFilters({ q: '' });
  };
  const known = partido ? partidos.some((p) => p.sigla.toLowerCase() === partido.toLowerCase()) : true;

  return (
    <div role="search" className="el-card mb-3 flex flex-col gap-2 p-3">
      <div>
        <label htmlFor={`el-q-${uid}`} className="mb-1 block text-base font-medium">
          {t.searchLabel}
        </label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            id={`el-q-${uid}`}
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            maxLength={MAX_Q}
            value={text}
            onChange={(e) => change(e.target.value)}
            placeholder={t.searchPlaceholder}
            className="el-select pl-10 pr-14 font-normal"
          />
          {text && (
            <button
              type="button"
              onClick={clear}
              aria-label={t.searchClear}
              className="absolute right-1 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-lg text-foreground"
            >
              <X className="h-6 w-6" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
      <div>
        <label htmlFor={`el-p-${uid}`} className="mb-1 block text-base font-medium">
          {t.partyFilter}
        </label>
        <select
          id={`el-p-${uid}`}
          value={partido ?? ''}
          onChange={(e) => onFilters({ partido: e.target.value || null })}
          className="el-select"
        >
          <option value="">{t.partyAllOption}</option>
          {!known && partido && <option value={partido}>{partido}</option>}
          {[...partidos]
            .sort((a, b) => a.sigla.localeCompare(b.sigla))
            .map((p) => (
              <option key={p.sigla} value={p.sigla}>
                {p.sigla}
              </option>
            ))}
        </select>
      </div>
    </div>
  );
}

type RowProps = {
  c: EleicaoCandidato;
  cargo: Cargo;
  uf: string;
  seat: boolean;
  maxVotes: number;
  compact?: boolean;
};

const DepRow = memo(function DepRow({ c, cargo, uf, seat, maxVotes, compact }: RowProps) {
  const { messages } = useAppPreferences();
  const t = messages.election;
  const color = toneFor(seat);
  const pct = Math.max(2, Math.min(100, (c.votos / maxVotes) * 100));
  return (
    <li
      className={`relative rounded-xl ${compact ? 'bg-muted px-2.5 py-1.5' : 'el-card px-3 py-2'}`}
      style={{ '--c': color } as CSSProperties}
      data-seat={seat || undefined}
    >
      <div className="flex items-center gap-3">
        <span className="w-8 shrink-0 text-center font-display text-base font-semibold tabular-nums text-muted-foreground">
          <span className="sr-only">{t.position} </span>
          {c.pos ?? c.seq}º
        </span>
        <Avatar c={c} size={compact ? 36 : 40} color={color} lead={seat} cargo={cargo} uf={uf} />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-lg font-medium leading-tight [overflow-wrap:anywhere]">{c.nome}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-base leading-tight text-muted-foreground">
            <span className="font-medium text-foreground">{c.partido ?? t.noParty}</span>
            {c.numero && <span>nº {c.numero}</span>}
            {c.eleito ? (
              <span title={c.situacao || undefined} className="el-pill px-2 text-base">
                <Check className="h-4 w-4" strokeWidth={3.5} aria-hidden="true" />
                {t.elected}
              </span>
            ) : (
              !compact && c.situacao && <span>{c.situacao}</span>
            )}
          </p>
        </div>
      </div>
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 pl-[2.75rem]">
        <span className="text-lg font-semibold tabular-nums">
          {formatVotes(c.votos)} <span className="font-medium text-muted-foreground">{t.votes}</span>
        </span>
        <span className="text-lg font-medium tabular-nums">{formatPct(c.percentual)}</span>
      </div>
      <div className="el-track ml-[2.75rem] mt-1 h-1.5" aria-hidden="true">
        <div className={seat ? 'el-fill-lead h-full' : 'h-full'} style={{ width: `${pct}%`, background: 'var(--c)' }} />
      </div>
    </li>
  );
});

function RowSkeletons() {
  return (
    <ul className="el-grid" aria-hidden="true">
      {Array.from({ length: 6 }, (_, i) => (
        <li key={i} className="el-card animate-pulse px-3 py-3">
          <div className="flex items-center gap-3">
            <div className="h-5 w-8 rounded bg-muted" />
            <div className="h-12 w-12 rounded-full bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-2/3 rounded bg-muted" />
              <div className="h-3 w-1/3 rounded bg-muted" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
