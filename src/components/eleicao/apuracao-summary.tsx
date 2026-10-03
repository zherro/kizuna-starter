'use client';

import { useEffect, useState } from 'react';
import { useAppPreferences } from '@kizuna/core/client/providers/app-preferences-provider';
import { isLive, voteMix } from '@/lib/eleicao/dynamics';
import { formatPct, formatVotes, type EleicaoTotalizacao, type EleicaoTse } from '@/lib/eleicao/normalize';
import { AnimatedNumber } from './animated-number';

function fill(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}

const fmtInt = (n: number) => formatVotes(Math.round(n));
const has = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n);

/**
 * Resumo da apuração da UF/escopo selecionado: seções, eleitorado, comparecimento, abstenção e
 * composição dos votos. Cada bloco só aparece se o número existir. Fundo branco; amarelo só na barra.
 */
export function ApuracaoSummary({
  tot,
  tse,
  updatedAt,
}: {
  tot: EleicaoTotalizacao | null;
  tse: EleicaoTse | null;
  updatedAt: string | null;
}) {
  const { messages } = useAppPreferences();
  const t = messages.election;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(id);
  }, []);
  const [open, setOpen] = useState(false);
  const live = isLive(updatedAt, now);
  if (!tot) return null;

  const hasAny = Object.values(tot).some(has) || tse;
  if (!hasAny) return null;
  const hasMore = has(tot.eleitorado) || has(tot.comparecimento) || has(tot.abstencoes) || has(tot.secoesNaoTotalizadas) || voteMix(tot) !== null;

  return (
    <section aria-labelledby="el-summary-title" className="el-card el-rise mb-3 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 id="el-summary-title" className="font-display text-xl font-semibold leading-tight">
          {t.summaryTitle}
        </h2>
        {live && (
          <span className="el-live" role="status">
            <span className="el-dot h-3 w-3 rounded-full" aria-hidden="true" />
            {t.live}
          </span>
        )}
      </div>

      {has(tot.pctSecoes) && <CountBar pct={tot.pctSecoes} tot={tot} />}

      <div className="mt-2 space-y-0.5 text-base">
        {has(tot.pComparecimento) && (
          <p>{fill(t.turnoutShort, { n: formatPct(tot.pComparecimento) })}</p>
        )}
        {tse && (
          <p className="text-muted-foreground">
            {t.summaryTse}: <span className="text-foreground">{tse.dg} {tse.hg}</span>
          </p>
        )}
      </div>

      {hasMore && (
        <>
          <button
            type="button"
            className="el-more mt-2"
            aria-expanded={open}
            aria-controls="el-summary-more"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? t.lessDetails : t.moreDetails}
          </button>
          <div id="el-summary-more" hidden={!open}>
            {open && (
              <>
                {(has(tot.eleitorado) || has(tot.comparecimento) || has(tot.abstencoes)) && (
                  <dl className="mt-2 grid grid-cols-1 gap-2">
                    {has(tot.eleitorado) && (
                      <Stat
                        label={t.electorate}
                        value={tot.eleitorado}
                        note={has(tot.pEleitoradoApurado) ? fill(t.electorateCounted, { n: formatPct(tot.pEleitoradoApurado) }) : null}
                      />
                    )}
                    {has(tot.comparecimento) && (
                      <Stat label={t.turnout} value={tot.comparecimento} note={has(tot.pComparecimento) ? formatPct(tot.pComparecimento) : null} />
                    )}
                    {has(tot.abstencoes) && (
                      <Stat label={t.abstention} value={tot.abstencoes} note={has(tot.pAbstencao) ? formatPct(tot.pAbstencao) : null} />
                    )}
                  </dl>
                )}
                {has(tot.secoesNaoTotalizadas) && tot.secoesNaoTotalizadas > 0 && (
                  <p className="mt-2 text-base text-muted-foreground">
                    {fill(t.sectionsLeft, { n: formatVotes(tot.secoesNaoTotalizadas) })}
                  </p>
                )}
                <VoteMix tot={tot} />
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function CountBar({ pct, tot }: { pct: number; tot: EleicaoTotalizacao }) {
  const { messages } = useAppPreferences();
  const t = messages.election;
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const width = Math.max(0, Math.min(100, pct));
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-lg font-medium">{t.sectionsCounts}</span>
        <AnimatedNumber
          value={pct}
          format={formatPct}
          className="font-display text-2xl font-semibold leading-none tabular-nums"
        />
      </div>
      <div
        className="el-track h-5"
        role="progressbar"
        aria-label={t.sectionsCounts}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(width)}
      >
        <div
          className="el-count-fill el-fill-lead h-full"
          data-running={width < 100}
          style={{ width: `${shown ? width : 0}%` }}
        />
      </div>
      {(has(tot.secoesTotalizadas) || has(tot.secoesNaoTotalizadas)) && (
        <div className="mt-2 text-base tabular-nums">
          {has(tot.secoesTotalizadas) && has(tot.secoesTotal) && (
            <p className="text-muted-foreground">
              {fill(t.urnsCounted, { n: formatVotes(tot.secoesTotalizadas), total: formatVotes(tot.secoesTotal) })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: number; note: string | null }) {
  return (
    <div className="min-w-0 rounded-[var(--el-r-ctl)] bg-muted px-3 py-1.5">
      <dt className="text-base text-muted-foreground">{label}</dt>
      <dd className="font-display text-lg font-semibold leading-tight tabular-nums">
        <AnimatedNumber value={value} format={fmtInt} />
        {note && <span className="block text-base font-medium text-muted-foreground">{note}</span>}
      </dd>
    </div>
  );
}

/** Barra empilhada: válidos (amarelo), brancos (cinza médio), nulos (cinza escuro); a legenda traz os números. */
function VoteMix({ tot }: { tot: EleicaoTotalizacao }) {
  const { messages } = useAppPreferences();
  const t = messages.election;
  const mix = voteMix(tot);
  if (!mix) return null;
  const style = {
    validos: { label: t.validVotes, bg: 'var(--el-accent-strong)' },
    brancos: { label: t.blank, bg: 'var(--el-bar)' },
    nulos: { label: t.nulls, bg: 'var(--el-line)' },
  } as const;
  return (
    <div className="mt-3">
      <h3 className="mb-2 text-lg font-medium">{t.voteBreakdown}</h3>
      <div className="el-track flex h-4" aria-hidden="true">
        {mix.map((r) => (
          <span key={r.key} style={{ width: `${r.pct}%`, background: style[r.key].bg, transition: 'width 700ms cubic-bezier(0.22, 1, 0.36, 1)' }} />
        ))}
      </div>
      <dl className="mt-3 flex flex-col gap-2">
        {mix.map((r) => (
          <div key={r.key} className="flex flex-wrap items-center justify-between gap-x-3 text-base">
            <dt className="flex min-w-0 items-center gap-2 text-muted-foreground">
              <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ background: style[r.key].bg }} aria-hidden="true" />
              <span>{style[r.key].label}</span>
            </dt>
            <dd className="shrink-0 font-medium tabular-nums">
              {formatVotes(r.votos)}
              <span className="ml-2 font-medium text-muted-foreground">{formatPct(r.pct)}</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
