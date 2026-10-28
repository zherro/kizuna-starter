import {
  defineCollection,
  loadEntries,
  type Entry,
  type EntryData,
  type LoadOptions,
} from '@kizuna/core/server/content';
import { LUGARES } from './lugares';

/**
 * Turismo: roteiros (rotas turísticas) e regiões (distritos) como coleções de conteúdo, mais a
 * leitura dos lugares com `tipo` (dormir | comer | atracao). Tudo vem de arquivo; só `aprovado` vai ao ar.
 * Conteúdo em `content/roteiros/<slug>/index.md` e `content/regioes/<slug>/index.md`.
 */
export const ROTEIROS = defineCollection({
  name: 'roteiros',
  contentDir: 'content/roteiros',
  mediaDir: 'public/roteiros',
  mediaUrl: '/roteiros',
  fields: {
    titulo: { type: 'string', required: true },
    cidade: { type: 'string', required: true },
    resumo: { type: 'string', required: true, max: 155 },
    status: { type: 'enum', values: ['rascunho', 'revisao', 'aprovado'], required: true },
    atualizado_em: { type: 'date', required: true },
    tema: { type: 'string' },
    duracao: { type: 'string' },
    dificuldade: { type: 'enum', values: ['facil', 'moderado', 'dificil'] },
    distancia: { type: 'string' },
    melhor_epoca: { type: 'string' },
    paradas: { type: 'list' },
    creditos: { type: 'string' },
  },
  publishWhen: { field: 'status', equals: 'aprovado' },
});

export const REGIOES = defineCollection({
  name: 'regioes',
  contentDir: 'content/regioes',
  mediaDir: 'public/regioes',
  mediaUrl: '/regioes',
  fields: {
    titulo: { type: 'string', required: true },
    cidade: { type: 'string', required: true },
    resumo: { type: 'string', required: true, max: 155 },
    status: { type: 'enum', values: ['rascunho', 'revisao', 'aprovado'], required: true },
    atualizado_em: { type: 'date', required: true },
    latitude: { type: 'number', min: -90, max: 90 },
    longitude: { type: 'number', min: -180, max: 180 },
    creditos: { type: 'string' },
  },
  publishWhen: { field: 'status', equals: 'aprovado' },
  validate: (d) =>
    (d.latitude === undefined) !== (d.longitude === undefined)
      ? 'latitude e longitude devem vir juntas'
      : null,
});

export type LugarTipo = 'dormir' | 'comer' | 'atracao';

export type TurismoLugar = {
  slug: string;
  cidade: string;
  title: string;
  kicker: string;
  summary: string;
  tipo: LugarTipo;
  faixaPreco: string | null;
  regiao: string | null;
  address: string | null;
  photo: string | null;
  href: string;
};

export type TurismoParada = Pick<TurismoLugar, 'slug' | 'cidade' | 'title' | 'photo' | 'address' | 'href'>;

export type TurismoRota = {
  slug: string;
  cidade: string;
  title: string;
  summary: string;
  tema: string | null;
  duracao: string | null;
  dificuldade: string | null;
  distancia: string | null;
  melhorEpoca: string | null;
  photo: string | null;
  paradas: TurismoParada[];
  href: string;
};

export type TurismoRegiao = {
  slug: string;
  cidade: string;
  title: string;
  summary: string;
  photo: string | null;
  href: string;
};

export type Turismo = {
  rotas: TurismoRota[];
  dormir: TurismoLugar[];
  comer: TurismoLugar[];
  atracoes: TurismoLugar[];
  regioes: TurismoRegiao[];
};

const text = (d: EntryData, k: string): string | null => {
  const v = d[k];
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
};
const list = (d: EntryData, k: string): string[] => {
  const v = d[k];
  return Array.isArray(v) ? v.map((s) => s.trim()).filter(Boolean) : [];
};

const byTitle = <T extends { title: string }>(a: T, b: T) => a.title.localeCompare(b.title, 'pt-BR');

function toLugar(e: Entry, tipo: LugarTipo): TurismoLugar {
  const cidade = String(e.data.cidade);
  return {
    slug: e.slug,
    cidade,
    title: text(e.data, 'titulo') ?? e.slug,
    kicker: text(e.data, 'categoria') ?? '',
    summary: text(e.data, 'resumo') ?? '',
    tipo,
    faixaPreco: text(e.data, 'faixa_preco'),
    regiao: text(e.data, 'regiao'),
    address: text(e.data, 'endereco'),
    photo: e.media[0] ?? null,
    href: `/${cidade}/lugares/${e.slug}`,
  };
}

export type LoadTurismoOptions = {
  /** Slugs de cidade da praça (ex.: cuiaba-mt, varzea-grande-mt); sem eles, todas. */
  citySlugs?: string[];
  root?: LoadOptions['root'];
};

/** Conteúdo de turismo publicado, já separado por seção. Parada que não existe/aprovada some da rota. */
export function loadTurismo({ citySlugs, root }: LoadTurismoOptions = {}): Turismo {
  const opts = root ? { root } : {};
  const inScope = (e: Entry) => !citySlugs || citySlugs.includes(String(e.data.cidade));

  const lugaresAll = loadEntries(LUGARES, opts).entries;
  const lugarBySlug = new Map(lugaresAll.map((e) => [e.slug, e]));
  const lugares = lugaresAll
    .filter(inScope)
    .flatMap((e) => {
      const tipo = text(e.data, 'tipo') as LugarTipo | null;
      return tipo ? [toLugar(e, tipo)] : [];
    })
    .sort(byTitle);

  const rotas: TurismoRota[] = loadEntries(ROTEIROS, opts)
    .entries.filter(inScope)
    .map((e) => {
      const cidade = String(e.data.cidade);
      const paradas = list(e.data, 'paradas').flatMap((slug): TurismoParada[] => {
        const l = lugarBySlug.get(slug);
        if (!l) return [];
        const { slug: s, cidade: c, title, photo, address, href } = toLugar(l, 'atracao');
        return [{ slug: s, cidade: c, title, photo, address, href }];
      });
      return {
        slug: e.slug,
        cidade,
        title: text(e.data, 'titulo') ?? e.slug,
        summary: text(e.data, 'resumo') ?? '',
        tema: text(e.data, 'tema'),
        duracao: text(e.data, 'duracao'),
        dificuldade: text(e.data, 'dificuldade'),
        distancia: text(e.data, 'distancia'),
        melhorEpoca: text(e.data, 'melhor_epoca'),
        photo: e.media[0] ?? null,
        paradas,
        href: `/${cidade}/roteiros/${e.slug}`,
      };
    })
    .sort(byTitle);

  const regioes: TurismoRegiao[] = loadEntries(REGIOES, opts)
    .entries.filter(inScope)
    .map((e) => {
      const cidade = String(e.data.cidade);
      return {
        slug: e.slug,
        cidade,
        title: text(e.data, 'titulo') ?? e.slug,
        summary: text(e.data, 'resumo') ?? '',
        photo: e.media[0] ?? null,
        href: `/${cidade}/regioes/${e.slug}`,
      };
    })
    .sort(byTitle);

  return {
    rotas,
    dormir: lugares.filter((l) => l.tipo === 'dormir'),
    comer: lugares.filter((l) => l.tipo === 'comer'),
    atracoes: lugares.filter((l) => l.tipo === 'atracao'),
    regioes,
  };
}
