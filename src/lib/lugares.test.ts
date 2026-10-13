import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadEntries } from '@kizuna/core/server/content';
import { LUGARES, buildLugarView, loadHomePlaces } from './lugares';

let root: string;
function put(rel: string, content: string) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}
const BASE =
  'titulo: Lua Morena\ncategoria: Casa noturna\ncidade: cuiaba-mt\nresumo: Resumo curto.\nstatus: aprovado\natualizado_em: 2026-10-11';

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'kz-lugares-'));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function load(front: string, body = 'Texto.') {
  put('content/lugares/lua-morena/index.md', `---\n${front}\n---\n\n${body}\n`);
  return loadEntries(LUGARES, { root });
}

describe('coleção lugares', () => {
  it('aceita um lugar completo', () => {
    const { entries, errors } = load(
      `${BASE}\nendereco: Av. X, 100\nlatitude: -15.601\nlongitude: -56.097\nhorario:\n  - Qui a sáb, 22h às 5h\ntelefone: (65) 3000-0000\nsite: https://exemplo.com\ninstagram: "@luamorena"\npreco: R$ 30 a R$ 60\ndicas_chegada: Estacionamento na rua lateral.\ncreditos: "Fotos: Fulano / CC BY 4.0"`
    );
    expect(errors).toEqual([]);
    expect(entries).toHaveLength(1);
  });

  it('exige latitude e longitude juntas', () => {
    expect(load(`${BASE}\nlatitude: -15.601`).errors[0].message).toMatch(/latitude e longitude/);
    expect(load(`${BASE}\nlongitude: -56.097`).errors[0].message).toMatch(/latitude e longitude/);
  });

  it('resumo acima de 155 caracteres é erro', () => {
    const long = 'x'.repeat(156);
    expect(load(BASE.replace('Resumo curto.', long)).errors[0].message).toMatch(/máximo é 155/);
  });

  it('só aprovado publica', () => {
    expect(load(BASE.replace('aprovado', 'rascunho')).entries).toEqual([]);
  });
});

describe('buildLugarView', () => {
  function view(front: string, body = 'Texto.') {
    const { entries, errors } = load(front, body);
    expect(errors).toEqual([]);
    return buildLugarView(entries[0], 'Cuiabá');
  }

  it('monta cabeçalho, destino, fatos e ações', () => {
    const v = view(
      `${BASE}\nendereco: Av. X, 100\nlatitude: -15.601\nlongitude: -56.097\nhorario:\n  - Qui a sáb\ntelefone: (65) 3000-0000\nsite: https://www.exemplo.com/lua\ninstagram: "@lua.morena"\npreco: R$ 30`
    );
    expect(v.title).toBe('Lua Morena');
    expect(v.kicker).toBe('Casa noturna · Cuiabá');
    expect(v.destination).toEqual({ lat: -15.601, lng: -56.097 });
    expect(v.address).toBe('Av. X, 100');
    const byKey = Object.fromEntries(v.facts.map((f) => [f.key, f]));
    expect(byKey.horario.value).toEqual(['Qui a sáb']);
    expect(byKey.telefone.href).toBe('tel:6530000000');
    expect(byKey.site.value).toBe('exemplo.com');
    expect(byKey.site.href).toBe('https://www.exemplo.com/lua');
    expect(byKey.instagram.value).toBe('@lua.morena');
    expect(byKey.instagram.href).toBe('https://instagram.com/lua.morena');
    expect(v.actions.map((a) => a.kind)).toEqual(['rota', 'ligar', 'site']);
    expect(v.actions[0].href).toBe('#como-chegar');
  });

  it('sem coordenadas, endereço, telefone e site: sem destino, fatos nem ações', () => {
    const v = view(BASE);
    expect(v.destination).toBeNull();
    expect(v.address).toBeNull();
    expect(v.facts).toEqual([]);
    expect(v.actions).toEqual([]);
  });

  it('só com endereço ainda oferece "Como chegar"', () => {
    const v = view(`${BASE}\nendereco: Av. X, 100`);
    expect(v.actions.map((a) => a.kind)).toEqual(['rota']);
  });

  it('instagram fora do formato aparece como texto, sem link', () => {
    const v = view(`${BASE}\ninstagram: "lua morena!!"`);
    const insta = v.facts.find((f) => f.key === 'instagram');
    expect(insta?.href).toBeUndefined();
  });

  it('telefone curto demais não vira link tel:', () => {
    const v = view(`${BASE}\ntelefone: "123"`);
    expect(v.facts.find((f) => f.key === 'telefone')?.href).toBeUndefined();
    expect(v.actions.map((a) => a.kind)).not.toContain('ligar');
  });

  it('telefone com mais de um número não vira link nem ação "Ligar"', () => {
    const v = view(`${BASE}
telefone: "(65) 3000-0000 / 99999-0000"`);
    const tel = v.facts.find((f) => f.key === 'telefone');
    expect(tel?.value).toBe('(65) 3000-0000 / 99999-0000');
    expect(tel?.href).toBeUndefined();
    expect(v.actions.map((a) => a.kind)).not.toContain('ligar');
  });

  it('telefone com texto junto não vira link', () => {
    const v = view(`${BASE}
telefone: "(65) 3000-0000 ramal 12"`);
    expect(v.facts.find((f) => f.key === 'telefone')?.href).toBeUndefined();
  });

  it('telefone internacional mantém o +', () => {
    const v = view(`${BASE}
telefone: "+55 (65) 93000-0000"`);
    expect(v.facts.find((f) => f.key === 'telefone')?.href).toBe('tel:+5565930000000');
  });

  it('0800 vira link tel:', () => {
    const v = view(`${BASE}
telefone: "0800 123 4567"`);
    expect(v.facts.find((f) => f.key === 'telefone')?.href).toBe('tel:08001234567');
  });

  it('fotos e créditos vêm da entrada', () => {
    put('public/lugares/lua-morena/01.jpg', 'x');
    put('public/lugares/lua-morena/02.jpg', 'x');
    const v = view(`${BASE}\ncreditos: "Fotos: Fulano"`);
    expect(v.photos).toEqual(['/lugares/lua-morena/01.jpg', '/lugares/lua-morena/02.jpg']);
    expect(v.credits).toBe('Fotos: Fulano');
  });
});

describe('loadHomePlaces', () => {
  function lugar(slug: string, front: Record<string, string>) {
    const data = {
      titulo: slug,
      categoria: 'Shopping',
      cidade: 'cuiaba-mt',
      resumo: `Resumo de ${slug}.`,
      status: 'aprovado',
      atualizado_em: '2026-10-01',
      ...front,
    };
    const yaml = Object.entries(data)
      .map(([k, v]) => `${k}: "${v}"`)
      .join('\n');
    put(`content/lugares/${slug}/index.md`, `---\n${yaml}\n---\n\nTexto.\n`);
  }

  it('só publicados, da cidade, do mais recente ao mais antigo, no contrato do card', () => {
    lugar('antigo', { atualizado_em: '2026-09-01', categoria: 'Casa noturna' });
    lugar('novo', { atualizado_em: '2026-10-11', endereco: 'Av. X, 100' });
    lugar('rascunho', { status: 'rascunho', atualizado_em: '2026-12-01' });
    lugar('outra-cidade', { cidade: 'varzea-grande-mt', atualizado_em: '2026-12-01' });
    put('public/lugares/novo/02.jpg', 'x');
    put('public/lugares/novo/01.jpg', 'x');

    const items = loadHomePlaces({ citySlug: 'cuiaba-mt', cityName: 'Cuiabá', limit: 10, root });
    expect(items).toEqual([
      {
        href: '/cuiaba-mt/lugares/novo',
        title: 'novo',
        kicker: 'Shopping',
        summary: 'Resumo de novo.',
        image: '/lugares/novo/01.jpg',
        meta: 'Av. X, 100',
      },
      {
        href: '/cuiaba-mt/lugares/antigo',
        title: 'antigo',
        kicker: 'Casa noturna',
        summary: 'Resumo de antigo.',
        image: null,
        meta: 'Cuiabá',
      },
    ]);
  });

  it('sem cidade traz todas as cidades e respeita o limite', () => {
    lugar('a', { atualizado_em: '2026-10-01' });
    lugar('b', { cidade: 'varzea-grande-mt', atualizado_em: '2026-10-03' });
    lugar('c', { atualizado_em: '2026-10-02' });
    expect(loadHomePlaces({ limit: 2, root }).map((i) => i.href)).toEqual([
      '/varzea-grande-mt/lugares/b',
      '/cuiaba-mt/lugares/c',
    ]);
    expect(loadHomePlaces({ limit: 0, root })).toEqual([]);
    expect(loadHomePlaces({ limit: 5, root })[0]).not.toHaveProperty('meta');
  });

  it('sem conteúdo devolve lista vazia', () => {
    expect(loadHomePlaces({ citySlug: 'cuiaba-mt', limit: 6, root })).toEqual([]);
  });
});
