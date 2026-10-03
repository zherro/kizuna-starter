'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowDown, ArrowUp, Check } from 'lucide-react';
import { useAppPreferences } from '@kizuna/core/client/providers/app-preferences-provider';
import { initials, toneFor } from '@/lib/eleicao/dynamics';
import { fotoUrl } from '@/lib/eleicao/client';
import { barWidth, formatPct, formatVotes, type Cargo, type EleicaoCandidato } from '@/lib/eleicao/normalize';
import { AnimatedNumber } from './animated-number';

function fill(text: string, n: string | number): string {
  return text.replace('{n}', String(n));
}

const fmtVotes = (n: number) => formatVotes(Math.round(n));

/** Foto circular com fallback de iniciais (sem foto, 404 ou erro de rede). */
export function Avatar({
  c,
  size,
  color,
  lead = false,
  cargo,
  uf,
}: {
  c: Pick<EleicaoCandidato, 'nome' | 'sqcand'>;
  size: number;
  color: string;
  /** Destaque: iniciais em amarelo cheio; os demais em neutro. */
  lead?: boolean;
  /** Deputados: o servidor busca a foto no TSE quando não há no volume. */
  cargo?: Cargo | null;
  uf?: string | null;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const img = useRef<HTMLImageElement>(null);

  // A imagem pode já estar em cache e ter disparado `load` antes do React anexar o handler.
  useEffect(() => {
    const el = img.current;
    if (el?.complete && el.naturalWidth > 0) setLoaded(true);
  }, []);

  return (
    <span
      className="relative inline-flex shrink-0 select-none rounded-full"
      style={{
        width: size,
        height: size,
        boxShadow: `0 0 0 2px var(--card), 0 0 0 4px ${lead ? 'var(--el-accent-strong)' : color}`,
      }}
    >
      <span
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-center rounded-full font-display font-medium"
        style={{
          background: lead ? 'var(--el-accent)' : 'var(--muted)',
          color: lead ? 'var(--el-accent-fg)' : 'var(--foreground)',
          fontSize: Math.round(size * 0.36),
        }}
      >
        {initials(c.nome)}
      </span>
      {c.sqcand && !failed && (
        // eslint-disable-next-line @next/next/no-img-element -- foto vem da rota própria, já cacheada
        <img
          ref={img}
          src={fotoUrl(c.sqcand, cargo, uf)}
          alt={c.nome}
          loading="lazy"
          decoding="async"
          width={size}
          height={size}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full rounded-full object-cover transition-opacity duration-300"
          style={{ opacity: loaded ? 1 : 0 }}
        />
      )}
    </span>
  );
}

function MoveArrow({ delta, stamp }: { delta: number; stamp: string }) {
  const { messages } = useAppPreferences();
  const t = messages.election;
  if (!delta) return null;
  const up = delta > 0;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span
      key={stamp}
      className="el-arrow inline-flex items-center gap-1 text-base font-medium"
      style={{ color: up ? 'var(--el-up)' : 'var(--el-down)' }}
    >
      <Icon className="h-5 w-5" aria-hidden="true" strokeWidth={3} />
      {fill(up ? t.movedUp : t.movedDown, Math.abs(delta))}
    </span>
  );
}

/** Barra de percentual (0–100): líder em amarelo (com contorno), demais em cinza; opcional linha dos 50%. */
function Bar({
  pct,
  height,
  majority,
  label,
  lead = false,
}: {
  pct: number;
  height: number;
  majority: boolean;
  label: string;
  lead?: boolean;
}) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div className="relative" style={{ paddingBlock: majority ? 4 : 0 }}>
      <div
        className="el-track"
        style={{ height }}
        role="progressbar"
        aria-valuenow={Math.round(barWidth(pct))}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className={lead ? 'el-fill-lead h-full' : 'h-full'}
          style={{
            width: `${shown ? barWidth(pct) : 0}%`,
            background: 'var(--c)',
            transition: 'width 800ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        />
      </div>
      {majority && (
        <span
          aria-hidden="true"
          className="absolute left-1/2 top-0 h-full w-1 -translate-x-1/2 rounded-full bg-foreground"
        />
      )}
    </div>
  );
}

export type CardProps = {
  c: EleicaoCandidato;
  position: number;
  /** Quantas posições o candidato subiu (+) ou caiu (−) desde a leitura anterior. */
  move: number;
  /** Marca de leitura (muda a cada atualização com mudança) para reanimar destaque/seta. */
  stamp: string;
  /** Mostra a linha dos 50% (maioria absoluta no 1º turno, Presidente). */
  majority: boolean;
  /** Índice na lista, para a entrada escalonada. */
  index: number;
  /** Rótulo da vaga (Senador): "Em vaga". */
  seatLabel?: string;
};

const meta = (c: EleicaoCandidato) => [c.partido, c.numero && `nº ${c.numero}`].filter(Boolean).join(' · ');

/**
 * Card do candidato (majoritários: Presidente, Governador, Senador), dois por linha. Quem está em
 * destaque (líder, vagas do Senador, eleitos) ganha anel/sombra amarela e selo, no mesmo tamanho.
 */
export function CandidateCard({ c, position, move, stamp, majority, index, seatLabel, highlight }: CardProps & { highlight: boolean }) {
  const { messages } = useAppPreferences();
  const t = messages.election;
  const color = toneFor(highlight);
  const first = position === 1;
  const badge = c.eleito ? t.elected : highlight ? (seatLabel ?? (first ? t.leader : `${position}º`)) : null;
  return (
    <li
      className={`${highlight ? 'el-lead' : 'el-card'} el-rise relative flex min-w-0 flex-col p-3`}
      data-first={first}
      style={{ '--c': color, '--i': index } as CSSProperties}
    >
      {move !== 0 && <span key={stamp} className="el-flash" aria-hidden="true" />}
      <div className="flex items-center gap-2">
        <Avatar c={c} size={44} color={color} lead={highlight} />
        <div className="flex min-w-0 flex-col items-start gap-0.5">
          <span className="font-display text-base font-semibold leading-none text-muted-foreground">
            <span className="sr-only">{t.position} </span>
            {position}º
          </span>
          {badge && (
            <span className="el-pill px-2">
              {c.eleito && <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" />}
              {badge}
            </span>
          )}
        </div>
      </div>
      <h3 className="mt-2 line-clamp-2 min-h-[2.6em] text-base font-medium leading-snug [overflow-wrap:anywhere]">{c.nome}</h3>
      <p className="truncate text-base text-muted-foreground">{meta(c)}</p>
      <MoveArrow delta={move} stamp={stamp} />
      <AnimatedNumber
        value={c.percentual}
        format={formatPct}
        className={`mt-1.5 font-display text-3xl leading-none tabular-nums ${first ? 'font-bold' : 'font-semibold'}`}
      />
      <span className="text-base tabular-nums text-muted-foreground">
        <AnimatedNumber value={c.votos} format={fmtVotes} className="font-medium text-foreground" /> {t.votes}
      </span>
      <div className="mt-2">
        <Bar pct={c.percentual} height={highlight ? 10 : 8} majority={majority} label={c.nome} lead={highlight} />
      </div>
    </li>
  );
}
