# Publicidade: slots, Google AdSense e criativos próprios — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gerenciar publicidade com Google AdSense e criativos próprios (imagem/GIF) em slots nomeados, sorteados por peso, com painel root de configuração e métricas por slot, criativo e página.

**Architecture:** Novo plugin `ads` no core (3 tabelas + 1 RPC pública), configs de resource no core, lógica pura em `shared/ads`, bloco `AdSlot` e tela root `ads` no core. O starter só faz spread dos resources, registra o plugin, adiciona o item de menu e monta `<AdSlot>` nas páginas. Sorteio no navegador (páginas seguem cacheáveis); métrica por contadores diários, sem cookie e sem dado pessoal.

**Tech Stack:** Postgres (PostgREST, RLS), Next.js 16, React 19, TypeScript, vitest, Tailwind 4.

**Spec:** `docs/superpowers/specs/2026-10-13-publicidade-slots-google-e-proprios-design.md`

## Global Constraints

- **Não commitar.** O usuário commita (core + starter) só quando pedir. "Checkpoint" = pausa para revisão.
- **Sem rotas `/api` novas.** Usar `postgrestResources` / `postgrestRpcs` e `/api/resources/[resource]`. Config de plugin do core em `kizuna-core/src/client/components/screen-engine/resources/`, spread em `src/lib/server/resources.ts`.
- **Tailwind varre `.md`:** nenhuma classe CSS inventada neste plano nem na doc.
- Paths: core = `kizuna-core/` (starter importa `@kizuna/core/*` = `kizuna-core/src/*`). Testes do core: `cd kizuna-core && npx vitest run <caminho>`. Tipos do starter: `npx tsc --noEmit -p .` na raiz.
- Mecânica: pesos; sorteio no navegador; slots definidos em código; criativos por **formato** (aparecem em qualquer slot do formato; opcionalmente restritos a slots); cada slot marca mídia aceita (`imagem`, `gif`, `google`).
- Formatos: `faixa`, `banner`, `card`, `card-vertical`, `retangulo`.
- Slots: `home-destaque`(faixa), `home-meio`(banner), `trilho-card`(card), `busca-patrocinado`(card), `descobrir-card`(card-vertical), `cidade-topo`(banner), `anuncio-rodape`(retangulo).
- Criativo próprio: só imagem/GIF + link. Sem HTML/script de terceiros. Link com `rel="sponsored noopener"`.
- Impressão: visível ≥ 50% por 1 s, uma vez por montagem. Clique só em criativo próprio. Google mede só impressão.
- "Patrocinado" fixo em todo item. Altura reservada por formato (sem salto de layout). Slot sem candidato colapsa.
- Estatística: chave (slot, criativo, página, dia). `page` = **padrão da rota**, nunca a URL. Google usa `creative_id` = `00000000-0000-0000-0000-000000000000`.
- GIF: o upload passa `optimizeImages=false`, porque o sharp do core usa `animated: false` e achataria o GIF. Purpose reaproveitado: `banner` (já permitido, sem migração de storage).
- Escrita só ROOT: permissão `ads`/`manage` (root passa sempre). Leitura pública só de slot habilitado e criativo ativo vigente.
- Limite por página: `ads.maxSlotsPerPage` em `kizuna.config.json` (default 3). Refina a regra "1 pago por tela" da spec: a home tem 3 espaços previstos.
- Consentimento: `AdSlot` aceita `allowGoogle` (default `true`); o starter liga ao mecanismo de consentimento quando existir.
- Banco em UTC (`CURRENT_DATE`), janelas do cliente em UTC.

## Review Focus

- Slot sem nenhum candidato (sem criativo e sem Google): colapsa, não deixa buraco nem erro. Pinado em Task 1 (`pickWeighted` com lista vazia) e Task 5.
- Criativo restrito a cidades quando a cidade do visitante é desconhecida: excluído. Pinado em Task 1.
- Criativo com `ends_at` já passado ou `starts_at` futuro: nunca sorteado. Pinado em Task 1 e no smoke SQL (RLS).
- Pesos todos 0 ou negativos: nada sorteado, sem divisão por zero. Pinado em Task 1.
- Contagem inflada por spam: `fn_ad_track` rejeita evento/página inválidos e slot desabilitado; incremento sempre 1. Pinado na Task 2 (smoke).

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `kizuna-core/src/shared/ads/types.ts` (novo) | Tipos e constantes (formatos, mídia, `GOOGLE_CREATIVE_ID`) |
| `kizuna-core/src/shared/ads/catalog.ts` (novo) | Catálogo de slots e especificação de formatos |
| `kizuna-core/src/shared/ads/select.ts` (novo) | Vigência, candidatos, sorteio ponderado |
| `kizuna-core/src/shared/ads/route-pattern.ts` (novo) | Pathname → padrão de rota |
| `kizuna-core/src/shared/ads/metrics.ts` (novo) | Agregação de estatísticas |
| `kizuna-core/src/shared/ads/index.ts` (novo) | Re-exports |
| `kizuna-core/plugins/ads/0001_ads.sql` (novo) | Tabelas, RLS, permissão, `fn_ad_track` |
| `kizuna-core/db/extras/ads_test_smoke.sql` (novo) | Smoke SQL com rollback |
| `kizuna-core/src/client/components/screen-engine/resources/ads.ts` (novo) | `resourceAds`, `rpcAds` |
| `kizuna-core/src/client/ads/ads-api.ts` (novo) | Leitura do pool e `trackAd` |
| `kizuna-core/src/client/ads/ad-slot.tsx`, `google-ad.tsx`, `index.ts` (novos) | Bloco `AdSlot` |
| `kizuna-core/src/client/components/root-screens/ads-screen.tsx` + `ads-slots-tab.tsx`, `ads-creatives-tab.tsx`, `ads-metrics-tab.tsx` (novos) | Tela root |
| `kizuna-core/src/client/components/root-screens/registry.ts` (modifica) | Slug `ads` |
| `kizuna.plugins.json`, `kizuna-core/starter/kizuna.plugins.json` (modificam) | Plugin `ads` após `analytics` |
| `src/lib/server/resources.ts`, `src/components/panel-nav.ts` (modificam) | Spread e menu |
| `kizuna.config.json`, `kizuna-core/starter/kizuna.config.json` (modificam) | Bloco `ads` |
| `kizuna-core/docs/plugins/ads.md`, `kizuna-core/plugins/README.md` (novo/modifica) | Documentação |

---

### Task 1: Domínio compartilhado (tipos, catálogo, seleção, rota, métricas)

**Files:**
- Create: `kizuna-core/src/shared/ads/{types,catalog,select,route-pattern,metrics,index}.ts`
- Test: `kizuna-core/src/shared/ads/{select,route-pattern,metrics}.test.ts`

**Interfaces:**
- Produces:
  - `AdFormat`, `AdKind`, `AdMedia`, `GOOGLE_CREATIVE_ID`
  - `AdSlotConfig = { slug: string; enabled: boolean; media: AdMedia[]; googleWeight: number; googleAdUnit: string | null; rotateSeconds: number }`
  - `AdCreative = { id: string; format: AdFormat; kind: AdKind; imageUrl: string; alt: string; linkUrl: string; label: string; weight: number; startsAt: string | null; endsAt: string | null; cities: string[]; slots: string[]; active: boolean }`
  - `AdCandidate = { type: 'own'; creative: AdCreative; weight: number } | { type: 'google'; adUnit: string; weight: number }`
  - `AD_SLOT_CATALOG: { slug: string; label: string; format: AdFormat }[]`, `AD_FORMAT_SPECS: Record<AdFormat, { label: string; minHeight: number }>`
  - `isVigente(c: AdCreative, now?: Date): boolean`
  - `buildCandidates(a: { slot: AdSlotConfig; format: AdFormat; creatives: AdCreative[]; city?: string | null; now?: Date; googleReady: boolean }): AdCandidate[]`
  - `pickWeighted(c: AdCandidate[], rand?: () => number): AdCandidate | null`
  - `routePattern(pathname: string, staticRoots?: readonly string[]): string`
  - `AdStatRow = { slot_slug: string; creative_id: string; page: string; day: string; impressions: number; clicks: number }`
  - `summarize(rows, f?: { slot?: string; page?: string; creativeId?: string }): { impressions: number; clicks: number; ctr: number | null }`
  - `groupStats(rows, key: 'slot_slug' | 'creative_id' | 'page'): { key: string; impressions: number; clicks: number; ctr: number | null }[]` (ordem desc por impressões)
  - `dailySeries(rows, from: string, to: string): { day: string; impressions: number; clicks: number }[]` (um item por dia, zerado se vazio)

- [ ] **Step 1: Escrever os testes que falham**

`select.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildCandidates, isVigente, pickWeighted } from './select';
import type { AdCreative, AdSlotConfig } from './types';

const slot: AdSlotConfig = {
  slug: 'home-meio', enabled: true, media: ['imagem', 'gif', 'google'],
  googleWeight: 2, googleAdUnit: '123', rotateSeconds: 0,
};
const mk = (o: Partial<AdCreative> = {}): AdCreative => ({
  id: 'c1', format: 'banner', kind: 'imagem', imageUrl: '/a.webp', alt: 'a', linkUrl: 'https://x.com',
  label: 'X', weight: 1, startsAt: null, endsAt: null, cities: [], slots: [], active: true, ...o,
});
const now = new Date('2026-10-13T12:00:00Z');

describe('isVigente', () => {
  it('rejeita inativo, futuro e vencido', () => {
    expect(isVigente(mk({ active: false }), now)).toBe(false);
    expect(isVigente(mk({ startsAt: '2026-10-14T00:00:00Z' }), now)).toBe(false);
    expect(isVigente(mk({ endsAt: '2026-10-12T00:00:00Z' }), now)).toBe(false);
    expect(isVigente(mk({ startsAt: '2026-10-01T00:00:00Z', endsAt: '2026-10-30T00:00:00Z' }), now)).toBe(true);
  });
});

describe('buildCandidates', () => {
  const base = { slot, format: 'banner' as const, now, googleReady: true };
  it('filtra por formato, kind aceito, restrição de slot e cidade', () => {
    const creatives = [
      mk({ id: 'ok' }),
      mk({ id: 'outro-formato', format: 'card' }),
      mk({ id: 'outro-slot', slots: ['cidade-topo'] }),
      mk({ id: 'so-cuiaba', cities: ['Cuiabá'] }),
    ];
    const ids = buildCandidates({ ...base, creatives, city: 'Cuiabá' })
      .flatMap((c) => (c.type === 'own' ? [c.creative.id] : []));
    expect(ids).toEqual(['ok', 'so-cuiaba']);
  });
  it('cidade desconhecida exclui criativo restrito a cidade', () => {
    const r = buildCandidates({ ...base, creatives: [mk({ cities: ['Cuiabá'] })], city: null });
    expect(r.some((c) => c.type === 'own')).toBe(false);
  });
  it('respeita media do slot (sem gif) e Google desligado', () => {
    const s = { ...slot, media: ['imagem'] as AdSlotConfig['media'] };
    const r = buildCandidates({ ...base, slot: s, creatives: [mk({ kind: 'gif' })] });
    expect(r).toEqual([]);
  });
  it('inclui Google só com peso, media e googleReady', () => {
    expect(buildCandidates({ ...base, creatives: [] })).toEqual([{ type: 'google', adUnit: '123', weight: 2 }]);
    expect(buildCandidates({ ...base, creatives: [], googleReady: false })).toEqual([]);
    expect(buildCandidates({ ...base, slot: { ...slot, googleWeight: 0 }, creatives: [] })).toEqual([]);
  });
  it('descarta peso zero', () => {
    expect(buildCandidates({ ...base, slot: { ...slot, googleWeight: 0 }, creatives: [mk({ weight: 0 })] })).toEqual([]);
  });
});

describe('pickWeighted', () => {
  const a = { type: 'google', adUnit: '1', weight: 1 } as const;
  const b = { type: 'own', creative: mk({ id: 'b' }), weight: 3 } as const;
  it('lista vazia ou pesos inválidos → null', () => {
    expect(pickWeighted([])).toBeNull();
    expect(pickWeighted([{ ...a, weight: 0 }, { ...a, weight: -2 }])).toBeNull();
  });
  it('respeita faixas de peso', () => {
    expect(pickWeighted([a, b], () => 0)).toBe(a);
    expect(pickWeighted([a, b], () => 0.24)).toBe(a);
    expect(pickWeighted([a, b], () => 0.25)).toBe(b);
    expect(pickWeighted([a, b], () => 0.999)).toBe(b);
  });
});
```

`route-pattern.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { routePattern } from './route-pattern';

describe('routePattern', () => {
  it('raiz e rotas estáticas', () => {
    expect(routePattern('/')).toBe('/');
    expect(routePattern('/busca')).toBe('/busca');
    expect(routePattern('/descobrir')).toBe('/descobrir');
  });
  it('troca segmentos dinâmicos', () => {
    expect(routePattern('/anuncios/abc-123')).toBe('/anuncios/[id]');
    expect(routePattern('/cuiaba')).toBe('/[cidade]');
    expect(routePattern('/cuiaba/bares')).toBe('/[cidade]/[id]');
  });
  it('ignora query, hash e barra final', () => {
    expect(routePattern('/busca/?q=x#y')).toBe('/busca');
  });
});
```

`metrics.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { dailySeries, groupStats, summarize, type AdStatRow } from './metrics';

const rows: AdStatRow[] = [
  { slot_slug: 'home-meio', creative_id: 'c1', page: '/', day: '2026-10-12', impressions: 100, clicks: 5 },
  { slot_slug: 'home-meio', creative_id: '00000000-0000-0000-0000-000000000000', page: '/', day: '2026-10-13', impressions: 50, clicks: 0 },
  { slot_slug: 'cidade-topo', creative_id: 'c1', page: '/[cidade]', day: '2026-10-13', impressions: 10, clicks: 1 },
];

describe('metrics', () => {
  it('summarize com filtros e CTR', () => {
    expect(summarize(rows)).toEqual({ impressions: 160, clicks: 6, ctr: 6 / 160 });
    expect(summarize(rows, { page: '/' })).toEqual({ impressions: 150, clicks: 5, ctr: 5 / 150 });
    expect(summarize([], {})).toEqual({ impressions: 0, clicks: 0, ctr: null });
  });
  it('groupStats ordena por impressões', () => {
    expect(groupStats(rows, 'page').map((g) => g.key)).toEqual(['/', '/[cidade]']);
    expect(groupStats(rows, 'creative_id')[0].key).toBe('c1');
  });
  it('dailySeries preenche dias vazios', () => {
    const s = dailySeries(rows, '2026-10-11', '2026-10-13');
    expect(s.map((d) => d.day)).toEqual(['2026-10-11', '2026-10-12', '2026-10-13']);
    expect(s.map((d) => d.impressions)).toEqual([0, 100, 60]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd kizuna-core && npx vitest run src/shared/ads`
Expected: FAIL (módulos não existem).

- [ ] **Step 3: Implementar**

`types.ts`:

```ts
export const AD_FORMATS = ['faixa', 'banner', 'card', 'card-vertical', 'retangulo'] as const;
export type AdFormat = (typeof AD_FORMATS)[number];
export const AD_KINDS = ['imagem', 'gif'] as const;
export type AdKind = (typeof AD_KINDS)[number];
export const AD_MEDIA = ['imagem', 'gif', 'google'] as const;
export type AdMedia = (typeof AD_MEDIA)[number];

/** `creative_id` usado nas estatísticas para o Google (sem criativo próprio). */
export const GOOGLE_CREATIVE_ID = '00000000-0000-0000-0000-000000000000';

export type AdSlotConfig = {
  slug: string;
  enabled: boolean;
  media: AdMedia[];
  googleWeight: number;
  googleAdUnit: string | null;
  rotateSeconds: number;
};

export type AdCreative = {
  id: string;
  format: AdFormat;
  kind: AdKind;
  imageUrl: string;
  alt: string;
  linkUrl: string;
  label: string;
  weight: number;
  startsAt: string | null;
  endsAt: string | null;
  cities: string[];
  slots: string[];
  active: boolean;
};

export type AdCandidate =
  | { type: 'own'; creative: AdCreative; weight: number }
  | { type: 'google'; adUnit: string; weight: number };
```

`catalog.ts`:

```ts
import type { AdFormat } from './types';

export type AdSlotDef = { slug: string; label: string; format: AdFormat };

export const AD_SLOT_CATALOG: AdSlotDef[] = [
  { slug: 'home-destaque', label: 'Home — abaixo do hero', format: 'faixa' },
  { slug: 'home-meio', label: 'Home — entre trilhos', format: 'banner' },
  { slug: 'trilho-card', label: 'Trilho — card Destaque', format: 'card' },
  { slug: 'busca-patrocinado', label: 'Busca — resultado patrocinado', format: 'card' },
  { slug: 'descobrir-card', label: 'Descobrir — card patrocinado', format: 'card-vertical' },
  { slug: 'cidade-topo', label: 'Cidade — topo', format: 'banner' },
  { slug: 'anuncio-rodape', label: 'Anúncio — rodapé', format: 'retangulo' },
];

export const AD_FORMAT_SPECS: Record<AdFormat, { label: string; minHeight: number }> = {
  faixa: { label: 'Faixa (larga e baixa)', minHeight: 90 },
  banner: { label: 'Banner largo', minHeight: 140 },
  card: { label: 'Card de lista', minHeight: 280 },
  'card-vertical': { label: 'Card vertical (Descobrir)', minHeight: 420 },
  retangulo: { label: 'Retângulo', minHeight: 250 },
};
```

`select.ts`:

```ts
import type { AdCandidate, AdCreative, AdFormat, AdSlotConfig } from './types';

export function isVigente(c: AdCreative, now: Date = new Date()): boolean {
  if (!c.active) return false;
  if (c.startsAt && new Date(c.startsAt).getTime() > now.getTime()) return false;
  if (c.endsAt && new Date(c.endsAt).getTime() < now.getTime()) return false;
  return true;
}

const norm = (s: string) => s.trim().toLowerCase();

export function buildCandidates(a: {
  slot: AdSlotConfig;
  format: AdFormat;
  creatives: AdCreative[];
  city?: string | null;
  now?: Date;
  googleReady: boolean;
}): AdCandidate[] {
  const { slot, format, creatives, city, now, googleReady } = a;
  const out: AdCandidate[] = [];
  for (const c of creatives) {
    if (c.format !== format || c.weight <= 0 || !isVigente(c, now)) continue;
    if (!slot.media.includes(c.kind)) continue;
    if (c.slots.length > 0 && !c.slots.includes(slot.slug)) continue;
    if (c.cities.length > 0) {
      if (!city || !c.cities.some((x) => norm(x) === norm(city))) continue;
    }
    out.push({ type: 'own', creative: c, weight: c.weight });
  }
  if (googleReady && slot.media.includes('google') && slot.googleWeight > 0 && slot.googleAdUnit) {
    out.push({ type: 'google', adUnit: slot.googleAdUnit, weight: slot.googleWeight });
  }
  return out;
}

export function pickWeighted(c: AdCandidate[], rand: () => number = Math.random): AdCandidate | null {
  const valid = c.filter((x) => x.weight > 0);
  const total = valid.reduce((s, x) => s + x.weight, 0);
  if (total <= 0) return null;
  let r = rand() * total;
  for (const x of valid) {
    if (r < x.weight) return x;
    r -= x.weight;
  }
  return valid[valid.length - 1];
}
```

`route-pattern.ts`:

```ts
export const DEFAULT_STATIC_ROOTS = [
  'busca', 'descobrir', 'anuncios', 'lugares', 'noticias', 'curtidos', 'contato', 'sobre', 'painel',
] as const;

/** `/anuncios/abc` → `/anuncios/[id]`; `/cuiaba/bares` → `/[cidade]/[id]`. Nunca devolve a URL real. */
export function routePattern(pathname: string, staticRoots: readonly string[] = DEFAULT_STATIC_ROOTS): string {
  const clean = pathname.split(/[?#]/)[0].replace(/\/+$/, '');
  const parts = clean.split('/').filter(Boolean);
  if (parts.length === 0) return '/';
  const [first, ...rest] = parts;
  const head = staticRoots.includes(first) ? first : '[cidade]';
  return '/' + [head, ...rest.map(() => '[id]')].join('/');
}
```

`metrics.ts`:

```ts
export type AdStatRow = {
  slot_slug: string;
  creative_id: string;
  page: string;
  day: string;
  impressions: number;
  clicks: number;
};
type Totals = { impressions: number; clicks: number; ctr: number | null };
const totals = (impressions: number, clicks: number): Totals => ({
  impressions, clicks, ctr: impressions > 0 ? clicks / impressions : null,
});

export function summarize(
  rows: AdStatRow[],
  f: { slot?: string; page?: string; creativeId?: string } = {},
): Totals {
  let i = 0;
  let c = 0;
  for (const r of rows) {
    if (f.slot && r.slot_slug !== f.slot) continue;
    if (f.page && r.page !== f.page) continue;
    if (f.creativeId && r.creative_id !== f.creativeId) continue;
    i += r.impressions;
    c += r.clicks;
  }
  return totals(i, c);
}

export function groupStats(rows: AdStatRow[], key: 'slot_slug' | 'creative_id' | 'page') {
  const m = new Map<string, { impressions: number; clicks: number }>();
  for (const r of rows) {
    const cur = m.get(r[key]) ?? { impressions: 0, clicks: 0 };
    cur.impressions += r.impressions;
    cur.clicks += r.clicks;
    m.set(r[key], cur);
  }
  return [...m.entries()]
    .map(([k, v]) => ({ key: k, ...totals(v.impressions, v.clicks) }))
    .sort((a, b) => b.impressions - a.impressions);
}

export function dailySeries(rows: AdStatRow[], from: string, to: string) {
  const byDay = new Map<string, { impressions: number; clicks: number }>();
  for (const r of rows) {
    const cur = byDay.get(r.day) ?? { impressions: 0, clicks: 0 };
    cur.impressions += r.impressions;
    cur.clicks += r.clicks;
    byDay.set(r.day, cur);
  }
  const out: { day: string; impressions: number; clicks: number }[] = [];
  const end = new Date(`${to}T00:00:00Z`).getTime();
  for (let t = new Date(`${from}T00:00:00Z`).getTime(); t <= end; t += 86_400_000) {
    const day = new Date(t).toISOString().slice(0, 10);
    out.push({ day, ...(byDay.get(day) ?? { impressions: 0, clicks: 0 }) });
  }
  return out;
}
```

`index.ts`:

```ts
export * from './types';
export * from './catalog';
export * from './select';
export * from './route-pattern';
export * from './metrics';
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd kizuna-core && npx vitest run src/shared/ads`
Expected: PASS.

- [ ] **Step 5: Checkpoint** (sem commit; o usuário commita sob pedido).

---

### Task 2: Plugin SQL `ads` + smoke

**Files:**
- Create: `kizuna-core/plugins/ads/0001_ads.sql`, `kizuna-core/db/extras/ads_test_smoke.sql`
- Modify: `kizuna.plugins.json`, `kizuna-core/starter/kizuna.plugins.json` (adicionar `"ads"` logo após `"analytics"`)

**Interfaces:**
- Produces: tabelas `public.ad_slots`, `public.ad_creatives`, `public.ad_stats_daily`; RPC `public.fn_ad_track(p_slot text, p_creative_id uuid, p_page text, p_event text) RETURNS boolean`; permissão `ads`/`manage`.

- [ ] **Step 1: Escrever o smoke (falha antes do plugin)**

`ads_test_smoke.sql` (roda com `docker exec -i postgres_local psql -U myuser -d foco_total_db < kizuna-core/db/extras/ads_test_smoke.sql`; espera NOTICE `ads OK`, sem ERROR, ROLLBACK):

```sql
BEGIN;
DO $$
DECLARE v_ok boolean; v_n integer; v_c uuid := gen_random_uuid();
BEGIN
  ASSERT to_regclass('public.ad_slots') IS NOT NULL, 'ad_slots existe';
  ASSERT EXISTS (SELECT 1 FROM auth.plugin_registry WHERE name = 'ads'), 'plugin registrado';

  INSERT INTO public.ad_slots (slug, enabled, media) VALUES ('smoke-on', true, ARRAY['imagem','google']);
  INSERT INTO public.ad_slots (slug, enabled, media) VALUES ('smoke-off', false, ARRAY['imagem']);
  INSERT INTO public.ad_creatives (id, format, kind, image_url, link_url, label, weight, active, ends_at)
  VALUES (v_c, 'banner', 'imagem', '/x.webp', 'https://x.com', 'X', 1, true, now() - interval '1 day');

  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  SET LOCAL ROLE anon;

  -- leitura pública: slot desabilitado e criativo vencido não aparecem
  SELECT count(*) INTO v_n FROM public.ad_slots WHERE slug = 'smoke-off';
  ASSERT v_n = 0, 'slot desabilitado invisível';
  SELECT count(*) INTO v_n FROM public.ad_creatives WHERE id = v_c;
  ASSERT v_n = 0, 'criativo vencido invisível';

  -- escrita direta negada
  BEGIN
    INSERT INTO public.ad_slots (slug) VALUES ('hack');
    RAISE EXCEPTION 'esperava erro';
  EXCEPTION WHEN insufficient_privilege OR others THEN
    IF SQLERRM = 'esperava erro' THEN RAISE; END IF;
  END;

  -- tracking
  v_ok := public.fn_ad_track('smoke-on', NULL, '/', 'impression');
  ASSERT v_ok, 'impressão google registra';
  v_ok := public.fn_ad_track('smoke-on', NULL, '/', 'impression');
  ASSERT v_ok, 'incrementa de novo';
  v_ok := public.fn_ad_track('smoke-off', NULL, '/', 'impression');
  ASSERT NOT v_ok, 'slot desabilitado não conta';
  v_ok := public.fn_ad_track('smoke-on', NULL, 'http://evil.com/x?y=1', 'impression');
  ASSERT NOT v_ok, 'página inválida rejeitada';
  v_ok := public.fn_ad_track('smoke-on', NULL, '/', 'purchase');
  ASSERT NOT v_ok, 'evento inválido rejeitado';
  v_ok := public.fn_ad_track('smoke-on', NULL, '/', 'click');
  ASSERT NOT v_ok, 'clique sem criativo próprio não conta';

  RESET ROLE;
  SELECT impressions INTO v_n FROM public.ad_stats_daily
   WHERE slot_slug = 'smoke-on' AND page = '/' AND creative_id = '00000000-0000-0000-0000-000000000000';
  ASSERT v_n = 2, 'contador = 2';

  RAISE NOTICE 'ads OK';
END $$;
ROLLBACK;
```

- [ ] **Step 2: Escrever `0001_ads.sql`**

```sql
-- plugins/ads/0001_ads.sql
-- Plugin: ads — slots de publicidade (Google AdSense + criativos próprios imagem/GIF).
-- Leitura pública só do que está habilitado/vigente; escrita só com `ads`/`manage` (root sempre).
-- Métrica: contadores diários por (slot, criativo, página, dia), sem dado pessoal. Uma única
-- função (escrita anônima por RPC, SECURITY DEFINER, validando tudo). Idempotente.

CREATE TABLE IF NOT EXISTS public.ad_slots (
  slug           text PRIMARY KEY,
  enabled        boolean NOT NULL DEFAULT false,
  media          text[]  NOT NULL DEFAULT ARRAY['imagem','gif','google'],
  google_weight  integer NOT NULL DEFAULT 0,
  google_ad_unit text,
  rotate_seconds integer NOT NULL DEFAULT 0,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ad_slots_slug_chk   CHECK (slug ~ '^[a-z0-9-]{1,40}$'),
  CONSTRAINT ad_slots_media_chk  CHECK (media <@ ARRAY['imagem','gif','google']),
  CONSTRAINT ad_slots_weight_chk CHECK (google_weight BETWEEN 0 AND 1000),
  CONSTRAINT ad_slots_rotate_chk CHECK (rotate_seconds = 0 OR rotate_seconds BETWEEN 5 AND 600)
);

CREATE TABLE IF NOT EXISTS public.ad_creatives (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  format     text NOT NULL,
  kind       text NOT NULL,
  image_url  text NOT NULL,
  alt        text NOT NULL DEFAULT '',
  link_url   text NOT NULL,
  label      text NOT NULL DEFAULT '',
  weight     integer NOT NULL DEFAULT 1,
  starts_at  timestamptz,
  ends_at    timestamptz,
  cities     text[] NOT NULL DEFAULT '{}',
  slots      text[] NOT NULL DEFAULT '{}',
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ad_creatives_format_chk CHECK (format IN ('faixa','banner','card','card-vertical','retangulo')),
  CONSTRAINT ad_creatives_kind_chk   CHECK (kind IN ('imagem','gif')),
  CONSTRAINT ad_creatives_weight_chk CHECK (weight BETWEEN 0 AND 1000),
  CONSTRAINT ad_creatives_link_chk   CHECK (link_url ~* '^https?://'),
  CONSTRAINT ad_creatives_image_chk  CHECK (image_url ~ '^(/|https?://)')
);

-- creative_id = 00000000-0000-0000-0000-000000000000 representa o Google (sem criativo próprio).
CREATE TABLE IF NOT EXISTS public.ad_stats_daily (
  slot_slug   text NOT NULL,
  creative_id uuid NOT NULL,
  page        text NOT NULL,
  day         date NOT NULL DEFAULT CURRENT_DATE,
  impressions integer NOT NULL DEFAULT 0,
  clicks      integer NOT NULL DEFAULT 0,
  PRIMARY KEY (slot_slug, creative_id, page, day),
  CONSTRAINT ad_stats_page_chk CHECK (page ~ '^/[A-Za-z0-9/_\[\]-]{0,80}$')
);
CREATE INDEX IF NOT EXISTS ad_stats_daily_day ON public.ad_stats_daily (day DESC);

ALTER TABLE public.ad_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_creatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_stats_daily ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.ad_slots, public.ad_creatives TO anon, auth_user;
GRANT INSERT, UPDATE ON public.ad_slots, public.ad_creatives TO auth_user;
GRANT SELECT ON public.ad_stats_daily TO auth_user;
REVOKE DELETE ON public.ad_slots, public.ad_creatives FROM anon, auth_user;
REVOKE INSERT, UPDATE, DELETE ON public.ad_stats_daily FROM anon, auth_user;

INSERT INTO auth.permissions (resource, action, name)
VALUES ('ads', 'manage', 'Gerenciar publicidade (slots, criativos e métricas)')
ON CONFLICT (resource, action) DO NOTHING;

DROP POLICY IF EXISTS ad_slots_select ON public.ad_slots;
CREATE POLICY ad_slots_select ON public.ad_slots FOR SELECT TO anon, auth_user
USING (enabled OR auth.fun_auth_has_perm('ads', 'manage'));
DROP POLICY IF EXISTS ad_slots_insert ON public.ad_slots;
CREATE POLICY ad_slots_insert ON public.ad_slots FOR INSERT TO auth_user
WITH CHECK (auth.fun_auth_has_perm('ads', 'manage'));
DROP POLICY IF EXISTS ad_slots_update ON public.ad_slots;
CREATE POLICY ad_slots_update ON public.ad_slots FOR UPDATE TO auth_user
USING (auth.fun_auth_has_perm('ads', 'manage'))
WITH CHECK (auth.fun_auth_has_perm('ads', 'manage'));

DROP POLICY IF EXISTS ad_creatives_select ON public.ad_creatives;
CREATE POLICY ad_creatives_select ON public.ad_creatives FOR SELECT TO anon, auth_user
USING (
  (active AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at >= now()))
  OR auth.fun_auth_has_perm('ads', 'manage')
);
DROP POLICY IF EXISTS ad_creatives_insert ON public.ad_creatives;
CREATE POLICY ad_creatives_insert ON public.ad_creatives FOR INSERT TO auth_user
WITH CHECK (auth.fun_auth_has_perm('ads', 'manage'));
DROP POLICY IF EXISTS ad_creatives_update ON public.ad_creatives;
CREATE POLICY ad_creatives_update ON public.ad_creatives FOR UPDATE TO auth_user
USING (auth.fun_auth_has_perm('ads', 'manage'))
WITH CHECK (auth.fun_auth_has_perm('ads', 'manage'));

DROP POLICY IF EXISTS ad_stats_select ON public.ad_stats_daily;
CREATE POLICY ad_stats_select ON public.ad_stats_daily FOR SELECT TO auth_user
USING (auth.fun_auth_has_perm('ads', 'manage'));

-- Única função: escrita anônima. SECURITY DEFINER porque anon não tem UPDATE no contador.
-- Valida slot habilitado, evento, página e (para clique) criativo próprio existente.
-- true = contou; false = rejeitado.
DROP FUNCTION IF EXISTS public.fn_ad_track(text, uuid, text, text);
CREATE OR REPLACE FUNCTION public.fn_ad_track(
  p_slot        text,
  p_creative_id uuid,
  p_page        text,
  p_event       text
)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $$
DECLARE
  v_creative uuid := COALESCE(p_creative_id, '00000000-0000-0000-0000-000000000000'::uuid);
BEGIN
  IF p_event NOT IN ('impression', 'click') THEN RETURN false; END IF;
  IF p_page IS NULL OR p_page !~ '^/[A-Za-z0-9/_\[\]-]{0,80}$' THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ad_slots WHERE slug = p_slot AND enabled) THEN RETURN false; END IF;
  IF p_creative_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ad_creatives WHERE id = p_creative_id AND active
  ) THEN RETURN false; END IF;
  IF p_event = 'click' AND p_creative_id IS NULL THEN RETURN false; END IF;

  INSERT INTO public.ad_stats_daily (slot_slug, creative_id, page, day, impressions, clicks)
  VALUES (p_slot, v_creative, p_page, CURRENT_DATE,
          CASE WHEN p_event = 'impression' THEN 1 ELSE 0 END,
          CASE WHEN p_event = 'click' THEN 1 ELSE 0 END)
  ON CONFLICT (slot_slug, creative_id, page, day) DO UPDATE
    SET impressions = public.ad_stats_daily.impressions + EXCLUDED.impressions,
        clicks      = public.ad_stats_daily.clicks + EXCLUDED.clicks;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_ad_track(text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_ad_track(text, uuid, text, text) TO anon, auth_user;

-- Retenção: 400 dias (SQL inline, só com pg_cron).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'ads_retention';
    PERFORM cron.schedule('ads_retention', '20 3 * * *',
      'DELETE FROM public.ad_stats_daily WHERE day < CURRENT_DATE - 400');
  ELSE
    RAISE NOTICE 'pg_cron ausente — agendar por fora: DELETE FROM public.ad_stats_daily WHERE day < CURRENT_DATE - 400;';
  END IF;
END $$;

INSERT INTO auth.plugin_registry (name, version)
VALUES ('ads', '1.0.0')
ON CONFLICT (name) DO UPDATE SET version = EXCLUDED.version;

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 3: Registrar o plugin nas duas listas** (`"ads"` depois de `"analytics"`) e regenerar o consolidado: `node kizuna-core/db/build.mjs` (e `node db/build.mjs` do starter, se existir; conferir `START.md`).

- [ ] **Step 4: Aplicar e rodar o smoke**

Run: `node kizuna-core/cli install` e depois `docker exec -i postgres_local psql -U myuser -d foco_total_db < kizuna-core/db/extras/ads_test_smoke.sql`
Expected: `NOTICE: ads OK`, sem ERROR.

- [ ] **Step 5: Checkpoint.**

---

### Task 3: Resource configs e fiação do starter

**Files:**
- Create: `kizuna-core/src/client/components/screen-engine/resources/ads.ts`
- Test: `kizuna-core/src/client/components/screen-engine/resources/ads.test.ts`
- Modify: `src/lib/server/resources.ts`

**Interfaces:**
- Produces: `resourceAds: Record<string, ResourceConfig>` com `ad_slots`, `ad_creatives`, `ad_stats_daily`; `rpcAds: Record<string, RpcConfig>` com `fn_ad_track`. `mapOutput` entrega `AdSlotConfig`/`AdCreative`/`AdStatRow` (camelCase onde o tipo define).
- Consumes: tipos do Task 1.

- [ ] **Step 1: Teste do mapeamento**

```ts
import { describe, expect, it } from 'vitest';
import { resourceAds, rpcAds } from './ads';

describe('resourceAds', () => {
  it('ad_slots mapeia para AdSlotConfig e lista sem login', () => {
    const c = resourceAds.ad_slots;
    expect(c.listRequiresAuth).toBe(false);
    expect(c.upsertOn).toBe('slug');
    expect(c.mapOutput!({
      slug: 'home-meio', enabled: true, media: ['imagem'], google_weight: 2, google_ad_unit: '9', rotate_seconds: 0,
    })).toEqual({
      slug: 'home-meio', enabled: true, media: ['imagem'], googleWeight: 2, googleAdUnit: '9', rotateSeconds: 0,
    });
  });
  it('ad_creatives mapeia entrada e saída', () => {
    const c = resourceAds.ad_creatives;
    expect(c.mapInput!({ imageUrl: '/a', linkUrl: 'https://x.com', startsAt: null, endsAt: null, format: 'card', kind: 'gif' }))
      .toMatchObject({ image_url: '/a', link_url: 'https://x.com', format: 'card', kind: 'gif' });
    expect(c.mapOutput!({
      id: 'u', format: 'card', kind: 'gif', image_url: '/a', alt: '', link_url: 'https://x.com', label: 'L',
      weight: 1, starts_at: null, ends_at: null, cities: [], slots: [], active: true,
    })).toMatchObject({ id: 'u', imageUrl: '/a', linkUrl: 'https://x.com' });
  });
  it('fn_ad_track é pública', () => {
    expect(rpcAds.fn_ad_track.requiresAuth).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar (falha)** — `cd kizuna-core && npx vitest run src/client/components/screen-engine/resources/ads.test.ts`

- [ ] **Step 3: Implementar `ads.ts`**

```ts
import type { RpcConfig } from '@kizuna/core/types';
import type { ResourceConfig } from '../types/resource-config';

const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
const str = (v: unknown): string | null => (v == null ? null : String(v));

/**
 * Plugin `ads`. Spread em `postgrestResources` / `postgrestRpcs` do projeto.
 * Leitura de slots e criativos é pública (RLS filtra habilitado/vigente); escrita exige `ads/manage`.
 */
export const resourceAds: Record<string, ResourceConfig> = {
  ad_slots: {
    schema: 'public',
    table: 'ad_slots',
    select: 'slug,enabled,media,google_weight,google_ad_unit,rotate_seconds',
    primaryKey: 'slug',
    defaultOrder: 'slug',
    searchableColumns: [],
    listRequiresAuth: false,
    upsertOn: 'slug',
    maxPageSize: 100,
    mapInput: (i) => ({
      slug: i.slug,
      enabled: i.enabled,
      media: i.media,
      google_weight: i.googleWeight,
      google_ad_unit: i.googleAdUnit || null,
      rotate_seconds: i.rotateSeconds,
      updated_at: new Date().toISOString(),
    }),
    mapOutput: (r) => ({
      slug: String(r.slug ?? ''),
      enabled: Boolean(r.enabled),
      media: arr(r.media),
      googleWeight: Number(r.google_weight ?? 0),
      googleAdUnit: str(r.google_ad_unit),
      rotateSeconds: Number(r.rotate_seconds ?? 0),
    }),
  },
  ad_creatives: {
    schema: 'public',
    table: 'ad_creatives',
    select: 'id,format,kind,image_url,alt,link_url,label,weight,starts_at,ends_at,cities,slots,active',
    primaryKey: 'id',
    defaultOrder: 'created_at',
    searchableColumns: ['label'],
    listRequiresAuth: false,
    maxPageSize: 200,
    mapInput: (i) => ({
      format: i.format,
      kind: i.kind,
      image_url: i.imageUrl,
      alt: i.alt ?? '',
      link_url: i.linkUrl,
      label: i.label ?? '',
      weight: i.weight,
      starts_at: i.startsAt || null,
      ends_at: i.endsAt || null,
      cities: i.cities ?? [],
      slots: i.slots ?? [],
      active: i.active,
      updated_at: new Date().toISOString(),
    }),
    mapOutput: (r) => ({
      id: String(r.id ?? ''),
      format: String(r.format ?? ''),
      kind: String(r.kind ?? ''),
      imageUrl: String(r.image_url ?? ''),
      alt: String(r.alt ?? ''),
      linkUrl: String(r.link_url ?? ''),
      label: String(r.label ?? ''),
      weight: Number(r.weight ?? 0),
      startsAt: str(r.starts_at),
      endsAt: str(r.ends_at),
      cities: arr(r.cities),
      slots: arr(r.slots),
      active: Boolean(r.active),
    }),
  },
  ad_stats_daily: {
    schema: 'public',
    table: 'ad_stats_daily',
    select: 'slot_slug,creative_id,page,day,impressions,clicks',
    primaryKey: 'day',
    defaultOrder: 'day',
    searchableColumns: [],
    maxPageSize: 1000,
    returnCountPreferDisabled: true,
  },
};

export const rpcAds: Record<string, RpcConfig> = {
  fn_ad_track: { schema: 'public', requiresAuth: false, optionalAuth: true },
};
```

- [ ] **Step 4: Rodar (passa).**

- [ ] **Step 5: Fiação do starter** em `src/lib/server/resources.ts`: importar `resourceAds, rpcAds` de `@kizuna/core/client/components/screen-engine/resources/ads`, `...(resourceAds as Record<string, ResourceConfig>)` em `postgrestResources` e `...rpcAds` em `postgrestRpcs`. Verificar: `npx tsc --noEmit -p .`

- [ ] **Step 6: Checkpoint.**

---

### Task 4: Cliente (pool e tracking)

**Files:**
- Create: `kizuna-core/src/client/ads/ads-api.ts`, `kizuna-core/src/client/ads/ads-api.test.ts`

**Interfaces:**
- Consumes: `AdSlotConfig`, `AdCreative`, `GOOGLE_CREATIVE_ID` (Task 1); `isAutomated` de `../analytics/visitor`.
- Produces:
  - `loadAdPool(): Promise<{ slots: AdSlotConfig[]; creatives: AdCreative[] }>` (uma busca por carga de página; memoizada; falha → pool vazio)
  - `trackAd(p: { slot: string; creativeId: string | null; page: string; event: 'impression' | 'click' }): void` (beacon best-effort; no-op SSR/automação)
  - `__resetAdPool()` (só testes)

- [ ] **Step 1: Teste**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { __resetAdPool, loadAdPool } from './ads-api';

afterEach(() => { __resetAdPool(); vi.restoreAllMocks(); });

describe('loadAdPool', () => {
  it('busca uma vez e memoiza', async () => {
    const f = vi.fn(async (url: string) =>
      new Response(JSON.stringify({ items: url.includes('ad_slots') ? [{ slug: 'a' }] : [{ id: 'c' }] })));
    vi.stubGlobal('fetch', f);
    const a = await loadAdPool();
    const b = await loadAdPool();
    expect(f).toHaveBeenCalledTimes(2); // ad_slots + ad_creatives, uma vez só
    expect(a).toBe(b);
    expect(a.slots).toEqual([{ slug: 'a' }]);
  });
  it('erro de rede → pool vazio, sem lançar', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('x'); }));
    await expect(loadAdPool()).resolves.toEqual({ slots: [], creatives: [] });
  });
});
```

- [ ] **Step 2: Rodar (falha)** — `cd kizuna-core && npx vitest run src/client/ads`

- [ ] **Step 3: Implementar**

```ts
import { GOOGLE_CREATIVE_ID, type AdCreative, type AdSlotConfig } from '../../shared/ads';
import { isAutomated } from '../analytics/visitor';

export type AdPool = { slots: AdSlotConfig[]; creatives: AdCreative[] };

const TRACK_URL = '/api/resources/fn_ad_track';
let pool: Promise<AdPool> | null = null;

async function getItems<T>(resource: string): Promise<T[]> {
  const res = await fetch(`/api/resources/${resource}?pageSize=200`, { credentials: 'same-origin' });
  if (!res.ok) return [];
  const body = (await res.json()) as { items?: T[] };
  return body.items ?? [];
}

/** Uma busca por carga de página (slots habilitados + criativos vigentes; a RLS filtra). */
export function loadAdPool(): Promise<AdPool> {
  if (!pool) {
    pool = Promise.all([getItems<AdSlotConfig>('ad_slots'), getItems<AdCreative>('ad_creatives')])
      .then(([slots, creatives]) => ({ slots, creatives }))
      .catch(() => ({ slots: [], creatives: [] }));
  }
  return pool;
}

export function __resetAdPool() {
  pool = null;
}

export function trackAd(p: { slot: string; creativeId: string | null; page: string; event: 'impression' | 'click' }): void {
  if (typeof window === 'undefined' || isAutomated()) return;
  const body = JSON.stringify({
    p_slot: p.slot,
    p_creative_id: p.creativeId && p.creativeId !== GOOGLE_CREATIVE_ID ? p.creativeId : null,
    p_page: p.page,
    p_event: p.event,
  });
  try {
    if (navigator.sendBeacon?.(TRACK_URL, new Blob([body], { type: 'application/json' }))) return;
  } catch { /* cai no fetch */ }
  void fetch(TRACK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
}
```

- [ ] **Step 4: Rodar (passa).** Conferir se `isAutomated` é exportado por `analytics/visitor.ts` (é).

- [ ] **Step 5: Checkpoint.**

---

### Task 5: Bloco `AdSlot` (+ Google)

> **UI:** executar com subagente, skills `frontend-design` e `ui-review` (regra do usuário). Bloco reutilizável fica no core; a página só monta.

**Files:**
- Create: `kizuna-core/src/client/ads/{ad-slot.tsx,google-ad.tsx,use-visible-once.ts,index.ts}`
- Test: `kizuna-core/src/client/ads/ad-slot.test.tsx`

**Interfaces:**
- Consumes: Tasks 1 e 4.
- Produces: `<AdSlot slot="home-meio" city?: string | null; adsenseClient?: string; allowGoogle?: boolean; maxPerPage?: number; className?: string />`

**Comportamento (testar cada item):**
- [ ] **Step 1: Testes** (jsdom, `fetch`/`IntersectionObserver` mockados):
  1. SSR/primeiro render: retorna `null` (evita divergência de hidratação); só decide após o `useEffect`.
  2. Slug fora do `AD_SLOT_CATALOG`, slot ausente/desabilitado ou sem candidatos → `null` (colapsa).
  3. Com um criativo próprio: renderiza `<a rel="sponsored noopener" target="_blank">` com `<img alt>` e o selo "Patrocinado"; container com `min-height` do formato.
  4. Impressão: com `IntersectionObserver` simulado em ratio ≥ 0.5 por 1 s → `trackAd` chamado uma vez com `{slot, creativeId, page, event: 'impression'}` e `page` = `routePattern(pathname)`. Ratio < 0.5 → não chama.
  5. Clique no link → `trackAd` com `event: 'click'`. Item Google: sem link e sem clique.
  6. `rotateSeconds > 0` → após o intervalo troca o item sorteado, só com `document.visibilityState === 'visible'`; reimpressão conta nova impressão.
  7. `maxPerPage`: o 4º `AdSlot` montado na mesma página (contador de módulo, zerado quando `pathname` muda) colapsa.
  8. `allowGoogle={false}` ou `adsenseClient` ausente → Google não entra nos candidatos.

- [ ] **Step 2: Rodar (falha).**

- [ ] **Step 3: Implementar**
  - `use-visible-once.ts`: `useVisibleFor(ref, { ratio: 0.5, ms: 1000 }, onVisible)` com `IntersectionObserver`; dispara uma vez por montagem/item; cancela timer ao sair da tela.
  - `google-ad.tsx`: injeta `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=<adsenseClient>` uma única vez (`id` fixo no `<script>`), renderiza `<ins class="adsbygoogle" data-ad-client data-ad-slot data-ad-format="auto" data-full-width-responsive="true">` e faz `(window.adsbygoogle = window.adsbygoogle || []).push({})` em `try/catch`. Sem clique rastreável.
  - `ad-slot.tsx`: `usePathname()` → `routePattern`; `loadAdPool()` no efeito; `buildCandidates` + `pickWeighted`; estado `picked`; contêiner `style={{ minHeight: AD_FORMAT_SPECS[format].minHeight }}` com selo "Patrocinado"; `rotateSeconds` via `setInterval` com checagem de visibilidade; `data-ad-slot` e `data-ad-kind` para teste/diagnóstico.
  - `index.ts`: `export { AdSlot } from './ad-slot'; export { loadAdPool, trackAd } from './ads-api';`
  - Estilo: usar os tokens/utilitários já usados em `kizuna-core/src/client/components/home/place-highlights.tsx` (mesmo raio, borda e tipografia dos cards); nenhuma classe inventada.

- [ ] **Step 4: Rodar (passa)** — `cd kizuna-core && npx vitest run src/client/ads`

- [ ] **Step 5: Checkpoint.**

---

### Task 6: Tela root `ads` (Slots, Criativos, Métricas)

> **UI:** subagente + `frontend-design` + `ui-review`. Seguir `storage-screen.tsx` (PageHeader, EmptyStateCard, `Tabs` de `components/ui/tabs.tsx`) como molde visual.

**Files:**
- Create: `kizuna-core/src/client/components/root-screens/{ads-screen.tsx,ads-slots-tab.tsx,ads-creatives-tab.tsx,ads-metrics-tab.tsx}`
- Test: `kizuna-core/src/client/components/root-screens/ads-screen.test.tsx`
- Modify: `kizuna-core/src/client/components/root-screens/registry.ts` (entrada `ads: { title: 'Publicidade', group: 'root', component: AdsScreen }`), `src/components/panel-nav.ts` (item no grupo Root: `{ title: 'Publicidade', href: '/painel/root/ads', icon: Megaphone, rootOnly: true }`, `Megaphone` de `lucide-react`)

**Interfaces:**
- Consumes: resources `ad_slots`, `ad_creatives`, `ad_stats_daily` (Task 3); `AD_SLOT_CATALOG`, `AD_FORMAT_SPECS`, `summarize`, `groupStats`, `dailySeries` (Task 1).
- Produces: `AdsScreen` (sem props).

- [ ] **Step 1: Testes** (jsdom, fetch mockado):
  1. Aba Slots lista **todos** os slugs do catálogo, mesmo sem linha no banco (linha ausente = desabilitado), e salva por upsert (`POST /api/resources/ad_slots` com `slug`).
  2. Marcar/desmarcar mídia (imagem/GIF/Google) e peso do Google alteram o payload; `googleAdUnit` vazio com `google` marcado mostra aviso "sem ad unit, o Google não será exibido".
  3. Aba Criativos: formulário valida link `http(s)`, peso 0–1000, `endsAt` ≥ `startsAt`; GIF sobe com `optimizeImages=false`, imagem com `true`; ambos `purpose=banner` para `/api/storage/files`; `imageUrl` = `/api/public/storage/files/<id>/content`.
  4. Aba Métricas: seletor 7/30/90 dias; tabelas por slot, criativo e página; filtro cruzado (clicar numa linha filtra as outras); linha Google rotulada "Google (só impressões)"; série diária.
  5. Estado vazio com `EmptyStateCard` quando não há dados.

- [ ] **Step 2: Rodar (falha).**

- [ ] **Step 3: Implementar.** Regras:
  - Aba Slots: card por slot (rótulo do catálogo, formato com `minHeight`), switch de habilitado, 3 checkboxes de mídia, peso do Google (0–1000), ad unit, `rotateSeconds` (0 ou 5–600), mini-métrica do período.
  - Aba Criativos: lista com miniatura, formato, kind, peso, vigência, cidades, ativo (desativar = `active=false`; **sem exclusão física**, o grant não permite); criar/editar em `Sheet`.
  - Aba Métricas: lê `ad_stats_daily?filter.day.gte=<from>` paginado (1000/página, máx. 20 páginas), calcula tudo no cliente com as funções do Task 1.
  - Banner de status: avisa se `ads.adsenseClient` não está configurado (via prop opcional `adsenseConfigured?: boolean`, passada pela page do starter).

- [ ] **Step 4: Rodar (passa)** — `cd kizuna-core && npx vitest run src/client/components/root-screens`

- [ ] **Step 5: Checkpoint.**

---

### Task 7: Config e colocação dos slots nas páginas

**Files:**
- Modify: `kizuna.config.json`, `kizuna-core/starter/kizuna.config.json` (bloco `"ads": { "adsenseClient": "", "maxSlotsPerPage": 3 }`)
- Create: `src/lib/ads.ts`
- Modify: `src/components/home-content.tsx` (ou o componente da home; ler o arquivo antes), páginas de busca, cidade e anúncio, e o Descobrir (ler cada arquivo antes de editar)
- Modify: `src/app/painel/root/[slug]/page.tsx` (passar `adsenseConfigured` ao `AdsScreen`, como já é feito para `papeis`)

**Interfaces:**
- Produces: `src/lib/ads.ts` exporta `adsConfig = { adsenseClient: string; maxSlotsPerPage: number }` lido de `kizuna.config.json` (padrão do `src/lib/analytics.ts`).

- [ ] **Step 1: Criar `src/lib/ads.ts`**

```ts
import cfg from '@/../kizuna.config.json';

type AdsCfg = { adsenseClient?: string; maxSlotsPerPage?: number };
const raw = ((cfg as { ads?: AdsCfg }).ads ?? {}) as AdsCfg;

export const adsConfig = {
  adsenseClient: /^ca-pub-\d{10,20}$/.test(raw.adsenseClient ?? '') ? (raw.adsenseClient as string) : '',
  maxSlotsPerPage: Math.min(Math.max(raw.maxSlotsPerPage ?? 3, 1), 10),
};
```

- [ ] **Step 2: Montar** `<AdSlot slot="..." adsenseClient={adsConfig.adsenseClient} maxPerPage={adsConfig.maxSlotsPerPage} />` nos pontos da tabela de slots (home-destaque abaixo do hero, home-meio entre trilhos, cidade-topo, anuncio-rodape; trilho-card, busca-patrocinado e descobrir-card entram como item da própria lista, na posição "1º ou 3º" e "a cada N cards"). **Cada página só monta**; nada de lógica de anúncio nas páginas.

- [ ] **Step 3: Verificar**: `npx tsc --noEmit -p .` na raiz e `cd kizuna-core && npx vitest run src/shared/ads src/client/ads src/client/components/root-screens`.

- [ ] **Step 4: Verificação visual** com `preview_start` + `ui-review`: com pool vazio nenhuma página mostra buraco; com um criativo cadastrado o slot aparece com selo e sem salto de layout em mobile (375) e desktop.

- [ ] **Step 5: Checkpoint.**

---

### Task 8: Documentação

**Files:**
- Create: `kizuna-core/docs/plugins/ads.md`
- Modify: `kizuna-core/plugins/README.md` (entrada `ads/`), `marketing/espacos-publicitarios.md` (marcar "Implementar os espaços" como feito e linkar a spec)

- [ ] **Step 1:** Documentar: tabelas, permissão `ads/manage`, `fn_ad_track`, como adicionar um slot (entrada em `AD_SLOT_CATALOG` + `<AdSlot>` na página), limites conhecidos (Google só impressão; contagem sem dedupe por visitante, sujeita a inflar; sem consentimento embutido, usar `allowGoogle`; sem agendamento por dia/hora).
- [ ] **Step 2:** Rodar toda a suíte tocada (comandos do Task 7, Step 3). Expected: PASS.
- [ ] **Step 3: Checkpoint final** para revisão e commit pelo usuário (core + starter).

---

## Self-Review

- **Cobertura da spec:** formatos e slots (T1), mídia por slot (T1/T2/T6), pesos e fallback (T1/T5), criativo por formato com restrição opcional (T1/T2), contadores por slot/criativo/página (T2/T4/T6), painel root com 3 abas (T6), config AdSense (T7), GIF sem achatar (T6), docs (T8). Sem lacunas.
- **Placeholders:** nenhum; a UI (T5/T6) descreve comportamento testável e delega o visual a subagente com skill de design, conforme a regra do usuário.
- **Consistência de tipos:** `AdSlotConfig`, `AdCreative`, `AdStatRow`, `GOOGLE_CREATIVE_ID`, `loadAdPool`, `trackAd` e os nomes `routePattern`/`pickWeighted`/`buildCandidates` batem entre T1, T3, T4, T5 e T6.
- **Desvio assumido da spec:** "1 espaço pago por tela" virou `maxSlotsPerPage` (default 3), porque a home prevê 3 espaços.
