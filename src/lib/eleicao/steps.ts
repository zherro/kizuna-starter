import type { Cargo } from './normalize';

// Regras puras do passo a passo "1. onde ver, 2. estado, 3. cargo" (sem React, testáveis).

export type StepId = 'scope' | 'cargo' | 'state';
export type Scope = 'nacional' | 'uf';

/** "Brasil" é o recorte nacional: só existe para Presidente. Os demais cargos são sempre por estado. */
export function isNational(cargo: Cargo, scope: Scope): boolean {
  return cargo === 'presidente' && scope === 'nacional';
}

/** Cargo disponível no recorte escolhido: no Brasil só Presidente; por estado, todos. */
export function cargoEnabled(target: Cargo, cargo: Cargo, scope: Scope): boolean {
  return !isNational(cargo, scope) || target === 'presidente';
}

/**
 * Passos na ordem em que aparecem: 1 onde ver (Brasil | Estado), 2 estado (só por estado) e
 * 3 cargo. No Brasil o passo do estado some e o cargo vira o 2.
 */
export function stepPlan(cargo: Cargo, scope: Scope): { id: StepId; n: number }[] {
  const ids: StepId[] = isNational(cargo, scope) ? ['scope', 'cargo'] : ['scope', 'state', 'cargo'];
  return ids.map((id, i) => ({ id, n: i + 1 }));
}

/** Falta escolher o estado: a página mostra o aviso em vez de resultados vazios. */
export function needsSelection(cargo: Cargo, scope: Scope, uf: string | null): boolean {
  const stateLevel = cargo !== 'presidente' || scope === 'uf';
  return stateLevel && !uf;
}

/** No DF o cargo estadual se chama Deputado Distrital. */
export function isDistrital(cargo: Cargo, uf: string | null): boolean {
  return cargo === 'deputado-estadual' && uf === 'DF';
}

export const UF_NAMES: Record<string, string> = {
  AC: 'Acre',
  AL: 'Alagoas',
  AM: 'Amazonas',
  AP: 'Amapá',
  BA: 'Bahia',
  CE: 'Ceará',
  DF: 'Distrito Federal',
  ES: 'Espírito Santo',
  GO: 'Goiás',
  MA: 'Maranhão',
  MG: 'Minas Gerais',
  MS: 'Mato Grosso do Sul',
  MT: 'Mato Grosso',
  PA: 'Pará',
  PB: 'Paraíba',
  PE: 'Pernambuco',
  PI: 'Piauí',
  PR: 'Paraná',
  RJ: 'Rio de Janeiro',
  RN: 'Rio Grande do Norte',
  RO: 'Rondônia',
  RR: 'Roraima',
  RS: 'Rio Grande do Sul',
  SC: 'Santa Catarina',
  SE: 'Sergipe',
  SP: 'São Paulo',
  TO: 'Tocantins',
};

/** "São Paulo (SP)"; ZZ (votos do exterior) vira o rótulo recebido. */
export function ufLabel(uf: string, exterior: string): string {
  if (uf === 'ZZ') return exterior;
  const name = UF_NAMES[uf];
  return name ? `${name} (${uf})` : uf;
}

/** Estados em ordem alfabética pelo nome completo; Exterior sempre por último. */
export function sortUfs(ufs: readonly string[]): string[] {
  const name = (u: string) => UF_NAMES[u] ?? u;
  return [...ufs].sort((a, b) => {
    if (a === 'ZZ') return b === 'ZZ' ? 0 : 1;
    if (b === 'ZZ') return -1;
    return name(a).localeCompare(name(b), 'pt-BR');
  });
}

/** Hora local legível "18:32" (24h, fixa para não depender do idioma do navegador). */
export function formatClock(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}
