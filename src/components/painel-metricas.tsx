'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { useOwnerStats } from '@kizuna/core/client/analytics';
import { cn } from '@kizuna/core/lib/utils';
import type { OwnerStats } from '@kizuna/core/shared/analytics';
import {
  METRIC_GROUPS,
  METRICS,
  PERIODS,
  SOURCE_LABELS,
  formatMetric,
  type MetricGroup,
  type PeriodDays,
} from '@/lib/analytics-metrics';

const CHART_W = 640;
const CHART_H = 160;

function linePath(values: number[], max: number): string {
  const step = values.length > 1 ? CHART_W / (values.length - 1) : 0;
  return values
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(CHART_H - (v / max) * (CHART_H - 8) - 4).toFixed(1)}`)
    .join(' ');
}

function SeriesChart({ series }: { series: OwnerStats['series'] }) {
  const max = Math.max(1, ...series.map((p) => Math.max(p.views, p.contacts * 6)));
  const views = series.map((p) => p.views);
  // Contatos em escala própria (×6) para ficarem legíveis ao lado das visualizações.
  const contacts = series.map((p) => p.contacts * 6);
  const areaPath = `${linePath(views, max)} L${CHART_W},${CHART_H} L0,${CHART_H} Z`;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-primary" /> Visualizações
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-amber-500" /> Cliques no contato (escala ×6)
        </span>
      </div>
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Visualizações e cliques no contato por dia"
        className="h-40 w-full"
      >
        <path d={areaPath} className="fill-primary/10" />
        <path d={linePath(views, max)} fill="none" strokeWidth={2} vectorEffect="non-scaling-stroke" className="stroke-primary" />
        <path d={linePath(contacts, max)} fill="none" strokeWidth={2} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" className="stroke-amber-500" />
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
        <span>{new Date(series[0]?.day ?? Date.now()).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', timeZone: 'UTC' })}</span>
        <span>Hoje</span>
      </div>
    </div>
  );
}

/** Títulos dos anúncios do tenant (uid → título) para a tabela por anúncio. */
function useAdTitles(tenantId: string): Record<string, string> {
  const [titles, setTitles] = useState<Record<string, string>>({});
  useEffect(() => {
    const controller = new AbortController();
    const qs = new URLSearchParams({ pageSize: '100', 'filter.tenant_id': tenantId });
    fetch(`/api/resources/services?${qs}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { items?: { uid: string; title: string }[] } | null) => {
        if (data?.items) setTitles(Object.fromEntries(data.items.map((i) => [i.uid, i.title])));
      })
      .catch(() => {});
    return () => controller.abort();
  }, [tenantId]);
  return titles;
}

export function PainelMetricas({ tenantId }: { tenantId: string }) {
  const [days, setDays] = useState<PeriodDays>(30);
  const { stats, loading, error } = useOwnerStats(days);
  const titles = useAdTitles(tenantId);
  const values = stats?.metrics ?? {};

  const groups = (Object.keys(METRIC_GROUPS) as MetricGroup[]).map((group) => ({
    group,
    metrics: METRICS.filter((m) => m.group === group),
  }));

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-8 px-4 py-8 md:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Métricas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Como seus anúncios estão performando.
          </p>
        </div>
        <div role="group" aria-label="Período" className="inline-flex rounded-xl border border-border bg-card p-1">
          {PERIODS.map((p) => (
            <button
              key={p.days}
              type="button"
              aria-pressed={p.days === days}
              onClick={() => setDays(p.days)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                p.days === days ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </header>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm md:p-6">
        <h2 className="mb-4 text-sm font-semibold">Evolução diária</h2>
        {stats ? (
          <SeriesChart series={stats.series} />
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {error ? 'Não foi possível carregar as métricas.' : loading ? 'Carregando…' : ''}
          </p>
        )}
      </section>

      {groups.map(({ group, metrics }) => (
        <section key={group} className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">{METRIC_GROUPS[group]}</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {metrics.map((metric) => {
              const Icon = metric.icon;
              const { value, delta } = values[metric.id] ?? { value: null, delta: 0 };
              const Trend = delta < 0 ? ArrowDownRight : ArrowUpRight;
              return (
                <article key={metric.id} className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="rounded-lg bg-primary/10 p-2 text-primary">
                      <Icon className="h-4 w-4" />
                    </span>
                    {delta !== 0 ? (
                      <span className={cn('inline-flex items-center text-xs font-medium', delta > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive')}>
                        <Trend className="h-3.5 w-3.5" />
                        {Math.abs(delta)}%
                      </span>
                    ) : null}
                  </div>
                  <div>
                    <p className="text-2xl font-semibold tracking-tight">{value === null ? '—' : formatMetric(metric.format, value)}</p>
                    <p className="text-sm">{metric.label}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{metric.hint}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm md:p-6">
          <h2 className="mb-4 text-sm font-semibold">De onde vêm as visitas</h2>
          <ul className="flex flex-col gap-3">
            {(stats?.sources ?? []).map((s) => (
              <li key={s.source}>
                <div className="mb-1 flex justify-between text-xs">
                  <span>{SOURCE_LABELS[s.source] ?? s.source}</span>
                  <span className="text-muted-foreground">{s.share}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${s.share}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm lg:col-span-2">
          <h2 className="px-4 pt-4 text-sm font-semibold md:px-6 md:pt-6">Desempenho por anúncio</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-4 py-2 font-medium md:px-6">Anúncio</th>
                  <th className="px-2 py-2 text-right font-medium">Impr.</th>
                  <th className="px-2 py-2 text-right font-medium">Views</th>
                  <th className="px-2 py-2 text-right font-medium">CTR</th>
                  <th className="px-2 py-2 text-right font-medium">Fav.</th>
                  <th className="px-2 py-2 text-right font-medium">Contatos</th>
                  <th className="px-4 py-2 text-right font-medium md:px-6">Taxa</th>
                </tr>
              </thead>
              <tbody>
                {(stats?.entities ?? []).map((ad) => (
                  <tr key={ad.entityId} className="border-b border-border last:border-0">
                    <td className="max-w-[220px] truncate px-4 py-2.5 font-medium md:px-6">{titles[ad.entityId] ?? 'Anúncio'}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{ad.impressions.toLocaleString('pt-BR')}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{ad.views.toLocaleString('pt-BR')}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{formatMetric('percent', ad.impressions > 0 ? (ad.views / ad.impressions) * 100 : 0)}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{ad.favorites}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{ad.contacts}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums md:px-6">{formatMetric('percent', ad.views > 0 ? (ad.contacts / ad.views) * 100 : 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
