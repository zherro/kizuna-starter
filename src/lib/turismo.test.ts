import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadEntries } from '@kizuna/core/server/content';
import { LUGARES } from './lugares';
import { ROTEIROS, REGIOES, loadTurismo } from './turismo';

let root: string;
function put(rel: string, content: string) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}
const lugar = (slug: string, extra = '', cidade = 'cuiaba-mt', status = 'aprovado') =>
  put(
    `content/lugares/${slug}/index.md`,
    `---\ntitulo: ${slug}\ncategoria: Pousada\ncidade: ${cidade}\nresumo: Resumo.\nstatus: ${status}\natualizado_em: 2026-10-28${extra ? `\n${extra}` : ''}\n---\n\nTexto.\n`
  );
const roteiro = (slug: string, paradas: string[], status = 'aprovado', cidade = 'cuiaba-mt') =>
  put(
    `content/roteiros/${slug}/index.md`,
    `---\ntitulo: ${slug}\ncidade: ${cidade}\nresumo: Resumo.\nstatus: ${status}\natualizado_em: 2026-10-28\ntema: natureza\nduracao: 1 dia\ndificuldade: facil\nparadas:\n${paradas.map((p) => `  - ${p}`).join('\n')}\n---\n\nTexto.\n`
  );
const regiao = (slug: string, status = 'aprovado') =>
  put(
    `content/regioes/${slug}/index.md`,
    `---\ntitulo: ${slug}\ncidade: cuiaba-mt\nresumo: Resumo.\nstatus: ${status}\natualizado_em: 2026-10-28\n---\n\nTexto.\n`
  );

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'kz-turismo-'));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('coleções de turismo', () => {
  it('lugar antigo, sem tipo, continua válido', () => {
    lugar('lua-morena');
    expect(loadEntries(LUGARES, { root }).errors).toEqual([]);
  });

  it('aceita os campos novos de lugar', () => {
    lugar('pousada-a', 'tipo: dormir\nfaixa_preco: $$\nregiao: sucuri\nmelhor_epoca: maio a setembro\ntempo_visita: 2 horas');
    expect(loadEntries(LUGARES, { root }).errors).toEqual([]);
  });

  it('rejeita tipo desconhecido e dificuldade inválida', () => {
    lugar('x', 'tipo: spa');
    expect(loadEntries(LUGARES, { root }).errors).toHaveLength(1);
    put('content/roteiros/r/index.md', '---\ntitulo: r\ncidade: cuiaba-mt\nresumo: R.\nstatus: aprovado\natualizado_em: 2026-10-28\ndificuldade: absurda\n---\n\nT\n');
    expect(loadEntries(ROTEIROS, { root }).errors).toHaveLength(1);
  });
});

describe('loadTurismo', () => {
  it('separa dormir, comer e atrações e ignora lugar sem tipo', () => {
    lugar('p1', 'tipo: dormir');
    lugar('r1', 'tipo: comer');
    lugar('a1', 'tipo: atracao');
    lugar('semtipo');
    const t = loadTurismo({ root });
    expect(t.dormir.map((i) => i.slug)).toEqual(['p1']);
    expect(t.comer.map((i) => i.slug)).toEqual(['r1']);
    expect(t.atracoes.map((i) => i.slug)).toEqual(['a1']);
    expect(t.dormir[0].href).toBe('/cuiaba-mt/lugares/p1');
  });

  it('não lista rascunho de lugar, roteiro nem região', () => {
    lugar('p1', 'tipo: dormir', 'cuiaba-mt', 'rascunho');
    roteiro('rota', [], 'revisao');
    regiao('reg', 'rascunho');
    const t = loadTurismo({ root });
    expect(t.dormir).toEqual([]);
    expect(t.rotas).toEqual([]);
    expect(t.regioes).toEqual([]);
  });

  it('descarta parada que não existe ou não está aprovada, sem quebrar o roteiro', () => {
    lugar('ok', 'tipo: atracao');
    lugar('pendente', 'tipo: atracao', 'cuiaba-mt', 'rascunho');
    roteiro('rota', ['ok', 'pendente', 'fantasma']);
    const t = loadTurismo({ root });
    expect(t.rotas).toHaveLength(1);
    expect(t.rotas[0].paradas.map((p) => p.slug)).toEqual(['ok']);
  });

  it('filtra pelas cidades da praça', () => {
    lugar('c1', 'tipo: dormir', 'cuiaba-mt');
    lugar('ch1', 'tipo: dormir', 'chapada-dos-guimaraes-mt');
    lugar('o1', 'tipo: dormir', 'sinop-mt');
    const t = loadTurismo({ root, citySlugs: ['cuiaba-mt', 'chapada-dos-guimaraes-mt'] });
    expect(t.dormir.map((i) => i.slug).sort()).toEqual(['c1', 'ch1']);
  });

  it('cidade sem conteúdo devolve listas vazias', () => {
    expect(loadTurismo({ root, citySlugs: ['cuiaba-mt'] })).toEqual({
      rotas: [],
      dormir: [],
      comer: [],
      atracoes: [],
      regioes: [],
    });
  });
});
