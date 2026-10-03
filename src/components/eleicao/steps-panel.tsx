'use client';

import { Check } from 'lucide-react';
import { useAppPreferences } from '@kizuna/core/client/providers/app-preferences-provider';
import { SelectPopover } from '@kizuna/core/client/components/ui-better-soft/select-popover';
import { CARGOS, type Cargo } from '@/lib/eleicao/normalize';
import { cargoEnabled, isDistrital, isNational, sortUfs, stepPlan, ufLabel, type StepId } from '@/lib/eleicao/steps';
import type { useEleicao } from './use-eleicao';

type S = ReturnType<typeof useEleicao>;

type Msgs = ReturnType<typeof useAppPreferences>['messages']['election'];

export function cargoLabelFor(t: Msgs, cargo: Cargo, uf: string | null): string {
  switch (cargo) {
    case 'presidente':
      return t.cargoPresidente;
    case 'governador':
      return t.cargoGovernador;
    case 'senador':
      return t.cargoSenador;
    case 'deputado-federal':
      return t.cargoDeputadoFederal;
    default:
      return isDistrital(cargo, uf) ? t.cargoDeputadoDistrital : t.cargoDeputadoEstadual;
  }
}

/** Botão de escolha em largura total: selecionado = amarelo + check + texto "selecionado". */
function Choice({
  label,
  on,
  onClick,
  selectedText,
  disabled = false,
  note,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
  selectedText: string;
  disabled?: boolean;
  note?: string;
}) {
  return (
    <button type="button" className="el-choice" aria-pressed={on} disabled={disabled} onClick={onClick}>
      <span className="el-choice-mark" aria-hidden="true">
        {on && <Check className="h-4 w-4" strokeWidth={3.5} />}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block font-medium leading-snug [overflow-wrap:anywhere]">{label}</span>
        {on && <span className="block text-sm leading-tight">{selectedText}</span>}
        {disabled && note && <span className="block text-sm leading-tight">{note}</span>}
      </span>
    </button>
  );
}

/** Seletor de estado (SelectPopover). Usado no passo "Estado" e no bloco de resultados: o valor é o mesmo. */
export function StatePicker({ s, id }: { s: S; id: string }) {
  const { messages } = useAppPreferences();
  const t = messages.election;
  const rawUfs = s.meta?.cargos[s.cargo]?.ufs ?? [];
  const ufs = sortUfs(s.uf && !rawUfs.includes(s.uf) ? [...rawUfs, s.uf] : rawUfs);
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-base">
        {t.stateSelectLabel}
      </label>
      <SelectPopover<string>
        id={id}
        ariaLabel={t.stateSelectLabel}
        value={s.uf ?? ''}
        options={[
          { value: '', label: t.statePlaceholder },
          ...ufs.map((u) => ({ value: u, label: ufLabel(u, t.stateExterior) })),
        ]}
        onChange={(v) => v && s.setUf(v)}
        className="el-select w-full justify-between"
        listClassName="el-select-list"
      />
    </div>
  );
}

/** Passo a passo: 1. onde ver (Brasil | Estado), 2. cargo, 3. estado (só por estado). */
export function StepsPanel({ s }: { s: S }) {
  const { messages } = useAppPreferences();
  const t = messages.election;
  const plan = stepPlan(s.cargo, s.scope);
  const national = isNational(s.cargo, s.scope);
  const titles: Record<StepId, string> = {
    scope: t.stepScopeTitle,
    cargo: t.stepCargoTitle,
    state: t.stepStateTitle,
  };

  // Brasil só existe para Presidente: sair de outro cargo volta para ele.
  const pickBrasil = () => {
    if (s.cargo !== 'presidente') s.setCargo('presidente');
    s.setScope('nacional');
  };

  return (
    <nav aria-label={t.filtersLabel} className="el-card mb-3 p-3">
      {plan.map(({ id, n }, i) => (
        <section key={id} aria-labelledby={`el-step-${id}`} className={i === 0 ? '' : 'mt-4'}>
          <h2 id={`el-step-${id}`} className="mb-1.5 text-base font-semibold leading-tight">
            {n}. {titles[id]}
          </h2>

          {id === 'scope' && (
            <div role="group" aria-labelledby={`el-step-${id}`} className="grid grid-cols-2 gap-2">
              <Choice label={t.scopeNational} on={national} onClick={pickBrasil} selectedText={t.selected} />
              <Choice label={t.scopeState} on={!national} onClick={() => s.setScope('uf')} selectedText={t.selected} />
            </div>
          )}

          {id === 'cargo' && (
            <div role="group" aria-labelledby={`el-step-${id}`} className="grid gap-2">
              {CARGOS.map((c) => (
                <Choice
                  key={c}
                  label={cargoLabelFor(t, c, s.uf)}
                  on={s.cargo === c}
                  onClick={() => s.setCargo(c)}
                  selectedText={t.selected}
                  disabled={!cargoEnabled(c, s.cargo, s.scope)}
                  note={t.onlyByState}
                />
              ))}
            </div>
          )}

          {id === 'state' && <StatePicker s={s} id="el-state-select" />}
        </section>
      ))}
      <div className="lg:hidden">
        <a href="#el-resultados" className="el-link mt-2">
          {t.goToResults}
        </a>
      </div>
    </nav>
  );
}
