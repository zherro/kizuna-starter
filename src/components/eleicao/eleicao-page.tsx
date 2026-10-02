'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { useAppPreferences } from '@kizuna/core/client/providers/app-preferences-provider';
import { Button, buttonVariants } from '@kizuna/core/client/components/ui/button';
import { TurnstileWidget } from '@kizuna/core/client/components/captcha';
import {
  barWidth,
  formatPct,
  formatVotes,
  type EleicaoCandidato,
  type EleicaoEscopo,
} from '@/lib/eleicao/normalize';
import { useEleicao } from './use-eleicao';

const TSE_URL = 'https://resultados.tse.jus.br';

type Tab = 'results' | 'tse';

function fill(text: string, n: string | number): string {
  return text.replace('{n}', String(n));
}

export function EleicaoPage() {
  const { messages } = useAppPreferences();
  const t = messages.election;
  const [tab, setTab] = useState<Tab>('results');
  const [tseOpened, setTseOpened] = useState(false);

  const openTab = (next: Tab) => {
    setTab(next);
    if (next === 'tse') setTseOpened(true);
  };

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 sm:pt-10">
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t.subtitle}</p>
      </header>

      <div role="tablist" className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
        {(
          [
            ['results', t.tabResults],
            ['tse', t.tabTse],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`eleicao-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`eleicao-panel-${id}`}
            onClick={() => openTab(id)}
            className={`h-10 rounded-lg text-sm font-semibold transition-colors ${
              tab === id
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id="eleicao-panel-results"
        aria-labelledby="eleicao-tab-results"
        hidden={tab !== 'results'}
      >
        <ResultsPanel active={tab === 'results'} />
      </div>

      <div
        role="tabpanel"
        id="eleicao-panel-tse"
        aria-labelledby="eleicao-tab-tse"
        hidden={tab !== 'tse'}
      >
        {tseOpened && <TsePanel />}
      </div>

      <p className="mt-8 text-center text-xs text-muted-foreground">{t.disclaimer}</p>
    </main>
  );
}

function ResultsPanel({ active }: { active: boolean }) {
  const { messages } = useAppPreferences();
  const t = messages.election;
  const s = useEleicao(true);
  const waiting = s.current?.data.status === 'aguardando';
  const data = s.current?.data.status === 'ok' ? (s.current.data as EleicaoEscopo) : null;
  const ufs = s.meta?.ufs ?? [];

  return (
    <section aria-live="polite" className={active ? undefined : 'hidden'}>
      <div role="group" aria-label={t.scopeLabel} className="mb-3 grid grid-cols-2 gap-1 rounded-xl border border-border p-1">
        {(
          [
            ['nacional', t.scopeNational],
            ['uf', t.scopeState],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={s.scope === id}
            onClick={() => s.setScope(id)}
            className={`h-9 rounded-lg text-sm font-medium transition-colors ${
              s.scope === id
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {s.scope === 'uf' && (
        <div
          role="group"
          aria-label={t.stateLabel}
          className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:thin]"
        >
          {ufs.map((u) => (
            <button
              key={u}
              type="button"
              aria-pressed={s.uf === u}
              onClick={() => s.setUf(u)}
              className={`h-9 min-w-11 shrink-0 rounded-full border px-3 text-sm font-semibold transition-colors ${
                s.uf === u
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-foreground hover:bg-accent'
              }`}
            >
              {u === 'ZZ' ? 'Exterior' : u}
            </button>
          ))}
        </div>
      )}

      <StatusBar
        turno={data?.turno ?? s.meta?.turno ?? null}
        pctSecoes={data?.totalizacao.pctSecoes ?? null}
        tse={data?.tse ?? s.meta?.tse ?? null}
        lastCheck={s.lastCheck}
        loading={s.loading}
        onRefresh={s.refresh}
      />

      {s.gate === 'captcha' && (
        <div className="mb-4 rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-semibold">{t.captchaTitle}</p>
          <p className="mb-2 text-xs text-muted-foreground">{t.captchaText}</p>
          <TurnstileWidget key={s.captchaKey} onToken={s.submitCaptcha} />
        </div>
      )}
      {s.gate === 'wait' && (
        <p className="mb-4 flex items-center gap-2 rounded-xl border border-border bg-card p-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          {t.throttledText}
        </p>
      )}

      {data ? (
        <>
          <ul className="flex flex-col gap-3">
            {data.candidatos.map((c, i) => (
              <CandidateCard key={`${s.scope}-${s.uf}-${c.seq}`} c={c} position={i + 1} />
            ))}
          </ul>
          <Totals data={data} />
        </>
      ) : waiting ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <p className="text-base font-semibold">{t.waitingTitle}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t.waitingText}</p>
        </div>
      ) : s.error && !s.loading ? (
        <div className="rounded-2xl border border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">{t.errorText}</p>
          <Button className="mt-3" variant="outline" onClick={s.refresh}>
            {t.retry}
          </Button>
        </div>
      ) : (
        <Skeletons />
      )}
    </section>
  );
}

function StatusBar(props: {
  turno: number | null;
  pctSecoes: number | null;
  tse: { dg: string; hg: string } | null;
  lastCheck: number | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  const { messages } = useAppPreferences();
  const t = messages.election;
  return (
    <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-border bg-card p-3">
      <div className="min-w-0 space-y-0.5 text-sm">
        <p className="font-semibold">
          {props.turno ? fill(t.round, props.turno) : t.title}
          {props.pctSecoes !== null && (
            <span className="font-normal text-muted-foreground">
              {' · '}
              {fill(t.sectionsCounted, formatPct(props.pctSecoes))}
            </span>
          )}
        </p>
        {props.tse && (
          <p className="text-xs text-muted-foreground">
            {fill(t.tseUpdatedAt, `${props.tse.dg} ${props.tse.hg}`)}
          </p>
        )}
        <UpdatedAgo since={props.lastCheck} />
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={props.onRefresh}
        disabled={props.loading}
        className="shrink-0 gap-2"
      >
        {props.loading ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
        )}
        <span>{props.loading ? t.refreshing : t.refresh}</span>
      </Button>
    </div>
  );
}

function UpdatedAgo({ since }: { since: number | null }) {
  const { messages } = useAppPreferences();
  const t = messages.election;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (since === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [since]);
  if (since === null) return null;
  const secs = Math.max(0, Math.round((now - since) / 1000));
  return (
    <p className="text-xs text-muted-foreground">
      {secs < 2 ? t.updatedNow : fill(t.updatedAgo, secs)}
    </p>
  );
}

function CandidateCard({ c, position }: { c: EleicaoCandidato; position: number }) {
  const { messages } = useAppPreferences();
  const t = messages.election;
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const leader = position === 1;
  return (
    <li className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
            leader ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
          }`}
          aria-label={`${position}º`}
        >
          {position}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="truncate text-base font-semibold">{c.nome}</h3>
            {c.eleito ? (
              <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
                {t.elected}
              </span>
            ) : (
              c.situacao && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {c.situacao}
                </span>
              )
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {[c.partido, c.numero].filter(Boolean).join(' · ')}
          </p>
        </div>
        <p className="shrink-0 text-right text-xl font-bold tabular-nums">
          {formatPct(c.percentual)}
        </p>
      </div>
      <div
        className="mt-3 h-2.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={Math.round(barWidth(c.percentual))}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={c.nome}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-700 ease-out ${
            leader ? 'bg-primary' : 'bg-primary/55'
          }`}
          style={{ width: `${shown ? barWidth(c.percentual) : 0}%` }}
        />
      </div>
      <p className="mt-1.5 text-xs tabular-nums text-muted-foreground">
        {formatVotes(c.votos)} {t.votes}
      </p>
    </li>
  );
}

function Totals({ data }: { data: EleicaoEscopo }) {
  const { messages } = useAppPreferences();
  const t = messages.election;
  const items = [
    [t.validVotes, data.totalizacao.votosValidos],
    [t.blank, data.totalizacao.brancos],
    [t.nulls, data.totalizacao.nulos],
  ] as const;
  if (items.every(([, v]) => v === null)) return null;
  return (
    <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-xl border border-border bg-card px-2 py-3">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="text-sm font-semibold tabular-nums">{formatVotes(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function Skeletons() {
  return (
    <ul className="flex flex-col gap-3" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <li key={i} className="animate-pulse rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-2/3 rounded bg-muted" />
              <div className="h-3 w-1/3 rounded bg-muted" />
            </div>
            <div className="h-6 w-14 rounded bg-muted" />
          </div>
          <div className="mt-3 h-2.5 rounded-full bg-muted" />
        </li>
      ))}
    </ul>
  );
}

function TsePanel() {
  const { messages } = useAppPreferences();
  const t = messages.election;
  return (
    <section>
      <p className="mb-3 text-sm text-muted-foreground">{t.tseHint}</p>
      <iframe
        src={TSE_URL}
        title={t.tseFrameTitle}
        loading="lazy"
        referrerPolicy="no-referrer"
        className="h-[70vh] min-h-[420px] w-full rounded-2xl border border-border bg-muted"
      />
      <a
        href={TSE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={`${buttonVariants({ variant: 'outline', size: 'lg' })} mt-4 w-full gap-2`}
      >
        <ExternalLink className="h-4 w-4" aria-hidden="true" />
        {t.tseOpen}
      </a>
    </section>
  );
}
