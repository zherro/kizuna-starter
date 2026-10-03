'use client';

import type { CSSProperties } from 'react';
import { Hourglass, ListChecks, Loader2, RefreshCw } from 'lucide-react';
import { useAppPreferences } from '@kizuna/core/client/providers/app-preferences-provider';
import { TurnstileWidget } from '@kizuna/core/client/components/captcha';
import { toneFor, candidateId, highlightCount, leadGap } from '@/lib/eleicao/dynamics';
import {
  formatPct,
  isDeputado,
  tseKey,
  formatVotes,
  type Cargo,
  type EleicaoEscopo,
} from '@/lib/eleicao/normalize';
import { formatClock, needsSelection, ufLabel } from '@/lib/eleicao/steps';
import { AnimatedNumber } from './animated-number';
import { CandidateCard } from './candidate-card';
import { ApuracaoSummary } from './apuracao-summary';
import { DeputadosView, SearchBar } from './deputados-view';
import { StatePicker, StepsPanel, cargoLabelFor } from './steps-panel';
import { useDeputados } from './use-deputados';
import type { useEleicao } from './use-eleicao';

export type EleicaoState = ReturnType<typeof useEleicao>;

function fill(text: string, n: string | number): string {
  return text.replace('{n}', String(n));
}

export function ResultsPanel({ s, active }: { s: EleicaoState; active: boolean }) {
  const { messages } = useAppPreferences();
  const t = messages.election;
  const isDep = isDeputado(s.cargo);
  const pick = needsSelection(s.cargo, s.scope, s.uf);
  const dep = useDeputados({
    enabled: active && isDep && !!s.uf && s.meta !== null && s.meta.status !== 'aguardando',
    cargo: s.cargo,
    uf: s.uf,
    q: s.q,
    partido: s.partido,
    tse: tseKey(s.meta?.cargos[s.cargo]?.tse),
    tick: s.manualTick,
    withGate: s.withGate,
  });
  const waiting = isDep
    ? dep.status === 'waiting' ||
      s.meta?.status === 'aguardando' ||
      (s.meta !== null && (!s.meta.cargos[s.cargo] || !s.uf))
    : s.current?.data.status === 'aguardando' || (!s.current && s.meta?.status === 'aguardando');
  const data = s.current?.data.status === 'ok' ? (s.current.data as EleicaoEscopo) : null;
  const busy = s.loading || (isDep && dep.busy);

  const cargoName = cargoLabelFor(t, s.cargo, s.uf);
  const where =
    s.cargo === 'presidente' && s.scope === 'nacional' ? t.whereBrazil : s.uf ? ufLabel(s.uf, t.stateExterior) : '';
  const heading = pick ? t.tabResults : t.resultsHeading.replace('{cargo}', cargoName).replace('{where}', where);

  return (
    <div className={active ? undefined : 'hidden'}>
      <div className="flex flex-col lg:grid lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:items-start lg:gap-5">
        <aside
          aria-label={t.filtersLabel}
          className="contents lg:block"
        >
          <StepsPanel s={s} />

          {isDep && dep.partidos.length > 0 && !pick && (
            <div className="hidden lg:block">
              <SearchBar q={s.q} partido={s.partido} partidos={dep.partidos} onFilters={s.setFilters} />
            </div>
          )}

          <div className="order-3 lg:order-none">
            {!pick && (
              <ApuracaoSummary
                tot={data?.totalizacao ?? dep.head?.totalizacao ?? null}
                tse={data?.tse ?? dep.head?.tse ?? s.meta?.cargos[s.cargo]?.tse ?? null}
                updatedAt={s.meta?.cargos[s.cargo]?.atualizadoEm ?? s.meta?.atualizadoEm ?? null}
              />
            )}
          </div>
        </aside>

        <section
          id="el-resultados"
          aria-labelledby="el-results-title"
          aria-live="polite"
          aria-busy={busy}
          className="order-2 min-w-0 scroll-mt-20 lg:order-none"
        >
          <h2 id="el-results-title" className="mb-2 font-display text-xl font-semibold leading-tight">
            {heading}
          </h2>

          {!pick && (
            <StatusBar
              turno={data?.turno ?? dep.head?.turno ?? s.meta?.cargos[s.cargo]?.turno ?? null}
              lastCheck={s.lastCheck}
              loading={busy}
              onRefresh={s.refresh}
            />
          )}

          {s.gate === 'captcha' && (
            <div role="alert" className="el-card mb-4 p-4">
              <p className="text-lg font-medium">{t.captchaTitle}</p>
              <p className="mb-3 text-base text-muted-foreground">{t.captchaText}</p>
              <TurnstileWidget key={s.captchaKey} onToken={s.submitCaptcha} />
            </div>
          )}
          {s.gate === 'wait' && (
            <p role="status" className="el-card mb-4 flex items-center gap-3 p-4 text-base font-medium">
              <Loader2 className="h-6 w-6 shrink-0 animate-spin" aria-hidden="true" />
              {t.throttledText}
            </p>
          )}

          {pick ? (
            <div className="el-card p-5 text-center">
              <ListChecks className="mx-auto mb-2 h-8 w-8" aria-hidden="true" />
              <p className="font-display text-xl font-semibold">{t.pickTitle}</p>
              <p className="mx-auto mt-1 max-w-sm text-base text-muted-foreground">{t.pickText}</p>
              <div className="mx-auto mt-4 max-w-sm text-left">
                <StatePicker s={s} id="el-state-select-results" />
              </div>
            </div>
          ) : isDep && !waiting && s.uf ? (
            <DeputadosView
              dep={dep}
              cargo={s.cargo}
              uf={s.uf}
              q={s.q}
              partido={s.partido}
              onFilters={s.setFilters}
              waiting={waiting}
              error={s.error}
              onRetry={s.refresh}
            />
          ) : data ? (
            <div key={`${s.cargo}-${s.scope}-${s.uf}`} className="el-swap">
              <Results data={data} cargo={s.cargo} moves={s.current?.moves ?? {}} stamp={s.current?.tse ?? ''} />
            </div>
          ) : waiting ? (
            <div className="el-card el-swap p-5 text-center">
              <Hourglass className="mx-auto mb-3 h-9 w-9" aria-hidden="true" />
              <p className="font-display text-xl font-semibold">{t.waitingTitle}</p>
              <p className="mx-auto mt-2 max-w-sm text-base text-muted-foreground">{t.waitingText}</p>
            </div>
          ) : s.error && !s.loading ? (
            <div role="alert" className="el-card p-5 text-center">
              <p className="text-lg font-medium">{t.errorText}</p>
              <button type="button" className="el-btn mt-4" onClick={s.refresh}>
                {t.retry}
              </button>
            </div>
          ) : (
            <Skeletons label={t.loadingResults} />
          )}
        </section>
      </div>
    </div>
  );
}

function Results({
  data,
  cargo,
  moves,
  stamp,
}: {
  data: EleicaoEscopo;
  cargo: Cargo;
  moves: Record<string, number>;
  stamp: string;
}) {
  const { messages } = useAppPreferences();
  const t = messages.election;
  const total = data.candidatos.length;
  const nLead = highlightCount(cargo, data.vagas, total);
  const majority = cargo === 'presidente' && (data.turno ?? 1) === 1;
  const seats = cargo === 'senador' ? (data.vagas ?? 1) : null;

  return (
    <>
      <GapStrip data={data} seats={seats} />
      <ol aria-label={t.rankingLabel} className="el-cards">
        {data.candidatos.map((c, i) => {
          const props = {
            c,
            position: i + 1,
            move: moves[candidateId(c)] ?? 0,
            stamp,
            majority,
            index: i,
          };
          return (
            <CandidateCard
              key={candidateId(c)}
              {...props}
              highlight={i < nLead}
              seatLabel={seats && i < nLead ? (i === 0 ? t.leader : t.seatTop) : undefined}
            />
          );
        })}
      </ol>
      {majority && total > 0 && (
        <p className="mt-4 flex items-start gap-3 text-base text-muted-foreground">
          <span aria-hidden="true" className="mt-1 inline-block h-5 w-1 shrink-0 rounded-full bg-foreground" />
          {t.absoluteMajority}
        </p>
      )}
      {seats && total > 0 && <p className="mt-4 text-base text-muted-foreground">{fill(t.seatsHint, nLead)}</p>}
    </>
  );
}

/** "Vantagem do 1º sobre o 2º" com um medidor das duas posições; no Senador, as vagas. */
function GapStrip({ data, seats }: { data: EleicaoEscopo; seats: number | null }) {
  const { messages } = useAppPreferences();
  const t = messages.election;
  const gap = leadGap(data.candidatos);
  if (!gap && !seats) return null;
  const [a, b] = data.candidatos;
  const sum = a && b ? a.percentual + b.percentual : 0;
  return (
    <div className="el-card el-rise mb-3 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        {gap ? (
          <div className="min-w-0">
            <p className="text-base font-medium text-muted-foreground">{t.leadGap}</p>
            <p className="font-display text-2xl font-semibold leading-tight tabular-nums">
              <AnimatedNumber value={gap.votos} format={(n) => fill(t.gapVotes, formatVotes(Math.round(n)))} />
            </p>
            <p className="text-lg font-medium tabular-nums">
              <AnimatedNumber value={gap.pp} format={(n) => fill(t.gapPoints, formatPct(n).replace('%', ''))} />
            </p>
          </div>
        ) : (
          <span />
        )}
        {seats && <span className="el-pill shrink-0 text-base">{fill(seats === 1 ? t.seatsOne : t.seatsMany, seats)}</span>}
      </div>
      {gap && a && b && sum > 0 && (
        <div className="el-track mt-3 flex h-3.5" aria-hidden="true">
          <span
            className="el-fill-lead"
            style={{ width: `${(a.percentual / sum) * 100}%`, background: toneFor(true) }}
          />
          <span style={{ width: `${(b.percentual / sum) * 100}%`, background: toneFor(false) }} />
        </div>
      )}
    </div>
  );
}

function StatusBar(props: {
  turno: number | null;
  lastCheck: number | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  const { messages } = useAppPreferences();
  const t = messages.election;
  return (
    <div className="el-card mb-3 px-4 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          {props.turno && <p className="text-lg font-medium">{fill(t.round, props.turno)}</p>}
          <p className="text-base font-medium" aria-live="polite">
            {props.lastCheck === null ? t.notUpdatedYet : fill(t.updatedAt, formatClock(props.lastCheck))}
          </p>
        </div>
        <button
          type="button"
          onClick={props.onRefresh}
          disabled={props.loading}
          aria-busy={props.loading}
          className="el-btn w-full sm:w-auto"
        >
          {props.loading ? (
            <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="h-6 w-6" aria-hidden="true" />
          )}
          <span>{props.loading ? t.refreshing : t.refresh}</span>
        </button>
      </div>
      <p className="mt-2 text-base text-muted-foreground">{t.autoRefreshOn}</p>
    </div>
  );
}

function Skeletons({ label }: { label: string }) {
  return (
    <div>
      <p role="status" className="mb-3 flex items-center gap-3 text-lg font-medium">
        <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
        {label}
      </p>
      <ul className="flex flex-col gap-3" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <li
            key={i}
            className="el-card animate-pulse p-4"
            style={{ minHeight: i === 0 ? 168 : 96 } as CSSProperties}
          >
            <div className="flex items-center gap-3">
              <div className={`${i === 0 ? 'h-20 w-20' : 'h-11 w-11'} rounded-full bg-muted`} />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-2/3 rounded bg-muted" />
                <div className="h-3 w-1/3 rounded bg-muted" />
              </div>
            </div>
            <div className="mt-3 h-3 rounded-full bg-muted" />
          </li>
        ))}
      </ul>
    </div>
  );
}
