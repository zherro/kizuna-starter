import { defineCollection, type Entry, type EntryData } from '@kizuna/core/server/content';

/**
 * Coleção "lugares": artigos editoriais de lugares (casas noturnas, casas de festas, shoppings).
 * O mecanismo (leitura, validação, fotos) é do core; aqui só se diz o que um lugar é.
 * Conteúdo em `content/lugares/<slug>/index.md`, fotos em `public/lugares/<slug>/`.
 */
export const LUGARES = defineCollection({
  name: 'lugares',
  contentDir: 'content/lugares',
  mediaDir: 'public/lugares',
  mediaUrl: '/lugares',
  fields: {
    titulo: { type: 'string', required: true },
    categoria: { type: 'string', required: true },
    cidade: { type: 'string', required: true },
    resumo: { type: 'string', required: true, max: 155 },
    status: { type: 'enum', values: ['rascunho', 'revisao', 'aprovado'], required: true },
    atualizado_em: { type: 'date', required: true },
    endereco: { type: 'string' },
    latitude: { type: 'number', min: -90, max: 90 },
    longitude: { type: 'number', min: -180, max: 180 },
    horario: { type: 'list' },
    telefone: { type: 'string' },
    instagram: { type: 'string' },
    site: { type: 'string', url: true },
    preco: { type: 'string' },
    dicas_chegada: { type: 'string' },
    creditos: { type: 'string' },
  },
  publishWhen: { field: 'status', equals: 'aprovado' },
  validate: (d) =>
    (d.latitude === undefined) !== (d.longitude === undefined)
      ? 'latitude e longitude devem vir juntas'
      : null,
});

export type LugarFactKey = 'endereco' | 'horario' | 'telefone' | 'site' | 'instagram' | 'preco';
export type LugarActionKind = 'rota' | 'ligar' | 'site';

export type LugarView = {
  title: string;
  kicker: string;
  summary: string;
  updatedAt: string;
  body: string;
  photos: string[];
  destination: { lat: number; lng: number } | null;
  address: string | null;
  tips: string | null;
  credits: string | null;
  facts: { key: LugarFactKey; label: string; value: string | string[]; href?: string }[];
  actions: { kind: LugarActionKind; label: string; href: string; external?: boolean }[];
};

const text = (data: EntryData, key: string): string | null => {
  const v = data[key];
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
};
const num = (data: EntryData, key: string): number | null => {
  const v = data[key];
  return typeof v === 'number' ? v : null;
};
const list = (data: EntryData, key: string): string[] => {
  const v = data[key];
  return Array.isArray(v) ? v.filter((s) => s.trim() !== '') : [];
};

/**
 * `tel:` só para UM número: tira só a pontuação de telefone (espaços, parênteses, pontos, hífens)
 * e um `+` inicial; se sobrar qualquer coisa que não seja dígito (letras, `/`, `,`, outro `+`) ou
 * a quantidade de dígitos não for de 8 a 13, o telefone aparece como texto, sem link.
 */
function telHref(raw: string): string | undefined {
  const trimmed = raw.trim();
  const plus = trimmed.startsWith('+');
  const digits = (plus ? trimmed.slice(1) : trimmed).replace(/[\s().-]/g, '');
  if (!/^\d{8,13}$/.test(digits)) return undefined;
  return `tel:${plus ? '+' : ''}${digits}`;
}

/** Aceita `@perfil`, `perfil` ou a URL do perfil; devolve o usuário ou `null` se não for válido. */
function instagramHandle(raw: string): string | null {
  const handle = raw
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .replace(/^@/, '')
    .replace(/\/+$/, '');
  return /^[A-Za-z0-9._]{1,30}$/.test(handle) ? handle : null;
}

function siteLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Reduz a entrada a dados prontos para a página (sem JSX): fácil de testar e de compor. */
export function buildLugarView(entry: Entry, cityName: string): LugarView {
  const d = entry.data;
  const lat = num(d, 'latitude');
  const lng = num(d, 'longitude');
  const destination = lat !== null && lng !== null ? { lat, lng } : null;
  const address = text(d, 'endereco');
  const phone = text(d, 'telefone');
  const site = text(d, 'site');
  const insta = text(d, 'instagram');
  const handle = insta ? instagramHandle(insta) : null;
  const phoneHref = phone ? telHref(phone) : undefined;
  const hours = list(d, 'horario');
  const price = text(d, 'preco');

  const facts: LugarView['facts'] = [];
  if (address) facts.push({ key: 'endereco', label: 'Endereço', value: address });
  if (hours.length > 0) facts.push({ key: 'horario', label: 'Horário', value: hours });
  if (phone) facts.push({ key: 'telefone', label: 'Telefone', value: phone, href: phoneHref });
  if (site) facts.push({ key: 'site', label: 'Site', value: siteLabel(site), href: site });
  if (insta) {
    facts.push(
      handle
        ? { key: 'instagram', label: 'Instagram', value: `@${handle}`, href: `https://instagram.com/${handle}` }
        : { key: 'instagram', label: 'Instagram', value: insta }
    );
  }
  if (price) facts.push({ key: 'preco', label: 'Preço', value: price });

  const actions: LugarView['actions'] = [];
  if (destination || address) actions.push({ kind: 'rota', label: 'Como chegar', href: '#como-chegar' });
  if (phoneHref) actions.push({ kind: 'ligar', label: 'Ligar', href: phoneHref });
  if (site) actions.push({ kind: 'site', label: 'Site', href: site, external: true });

  return {
    title: text(d, 'titulo') ?? entry.slug,
    kicker: `${text(d, 'categoria') ?? ''} · ${cityName}`,
    summary: text(d, 'resumo') ?? '',
    updatedAt: text(d, 'atualizado_em') ?? '',
    body: entry.body,
    photos: entry.media,
    destination,
    address,
    tips: text(d, 'dicas_chegada'),
    credits: text(d, 'creditos'),
    facts,
    actions,
  };
}
