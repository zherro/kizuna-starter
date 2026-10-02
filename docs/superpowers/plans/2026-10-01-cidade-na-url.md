# Cidade na URL (rota por cidade) — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A cidade passa a fazer parte do caminho da URL na raiz do app (`/cuiaba-mt`, `/cuiaba-mt/anuncio/[uid]`), o detalhe do anúncio tem link fixo pela cidade real do anúncio, e o seletor de cidade ganha um modo de confirmação para quando o usuário está vendo outra cidade.

**Architecture:** Slug derivado de nome + UF (sem coluna nova), função pura no core. O loader de detalhe do core passa a devolver a cidade canônica do anúncio. Um contexto leve no core (`ViewingCity*`) informa ao topo/seletor qual cidade a URL está mostrando. O starter ganha o segmento `[cidade]`, um cookie espelho `kz_city` (escrito por um componente cliente) para `/` redirecionar, e redirects permanentes do legado `/anuncios/[uid]`.

**Tech Stack:** Next.js 16 (App Router, Server Components, `permanentRedirect`), TypeScript, vitest + @testing-library/react (core), PostgREST via `serverFetchResource`/`pgrstRpc` do core.

**Spec:** `docs/superpowers/specs/2026-10-01-cidade-na-url-design.md`

## Global Constraints

- Nenhuma coluna, função ou view nova no banco. O slug é `slugify(nome) + '-' + uf`, minúsculo, sem acento (`Cuiabá/MT` vira `cuiaba-mt`).
- Só cidades com `location_city.search_city = true` (lista de `listLocationCities`) têm rota.
- Cookie de preferência: nome `kz_city`, valor = slug, `path=/`, `max-age=31536000`, `samesite=lax`. A fonte primária continua sendo `localStorage` (`user_location`, hook `useUserLocation`).
- A preferência só muda por escolha explícita no seletor ou detecção inicial sem cookie. Abrir uma rota de outra cidade **não** altera a preferência. Detecção por IP/GPS **nunca** navega.
- Mudanças no core são aditivas: sem `ViewingCityProvider` montado o seletor e a busca se comportam exatamente como hoje.
- Redirect do legado e de cidade errada usa `permanentRedirect` (HTTP 308, equivalente permanente do Next ao 301). `/` com cookie usa `redirect` (307).
- Anúncio sem cidade resolvível continua em `/anuncios/[uid]`; `/[cidade]/anuncio/[uid]` redireciona para lá (sem loop: o legado só redireciona quando há cidade).
- Estilo: aspas simples, 100 colunas, trailing comma es5. Classes Tailwind só as já usadas no código vizinho (o Tailwind varre `.md`; ver nota de memória do projeto) — **nada de colchetes com `|`, `…` ou espaço** em exemplos deste plano.
- Commits **só quando o usuário pedir**; os passos "Checkpoint" substituem commit. Core = `kizuna-core/` (submódulo, branch `develop`); starter = raiz. Testes do core: `cd kizuna-core && npx vitest run <path>`. Type-check do starter: `npx tsc --noEmit` na raiz.

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `kizuna-core/src/shared/city-routing/city-slug.ts` (+ test) | `citySlug`, `cityPath`, `serviceHref`, `isRoutableSlug`, `RESERVED_SLUGS`, buscas na lista de cidades, `CITY_COOKIE` |
| `kizuna-core/src/server/services/service-city.ts` (+ test) | `pickServiceCity`: cidade canônica de um anúncio |
| `kizuna-core/src/server/services/service-detail-data.ts` | `ServiceDetailData.city` |
| `kizuna-core/src/server/services/category-rail-data.ts` | opção `cityIbge` |
| `kizuna-core/src/client/components/viewing-city.tsx` (+ test) | contexto da cidade em exibição |
| `kizuna-core/src/client/components/location-modal.tsx` (+ test) | trigger mostra a cidade em exibição; modal em modo de confirmação |
| `kizuna-core/src/client/components/services/detail/service-carousel.tsx`, `service-carousel-section.tsx` | `showCity`, href canônico |
| `kizuna-core/src/client/components/search/search-results-view.tsx` | href canônico |
| `src/lib/server/cities.ts` | lista de cidades roteáveis em cache, `resolveCitySlug` |
| `src/components/city-cookie-sync.tsx` | espelha a cidade salva no cookie |
| `src/components/city-route-marker.tsx` | marca a cidade da URL no contexto e navega ao trocar |
| `src/components/city-invite.tsx` | convite "Ver mais serviços em ..." + seletor |
| `src/components/home-page.tsx` | corpo da home (global ou de uma cidade) |
| `src/app/page.tsx` | home global + redirect pelo cookie |
| `src/app/[cidade]/layout.tsx`, `page.tsx` | home da cidade |
| `src/lib/anuncio-detail.tsx` | loader em cache, metadata e corpo compartilhados do detalhe |
| `src/app/[cidade]/anuncio/[uid]/page.tsx` | detalhe canônico |
| `src/app/anuncios/[uid]/page.tsx` | legado: redirect ou render (sem cidade) |
| `src/app/sitemap.ts` | uma URL por cidade |
| `src/app/layout.tsx` | monta `ViewingCityProvider` e `CityCookieSync` |

---

### Task 1: Slug e utilitários de cidade (core, puro)

**Files:**
- Create: `kizuna-core/src/shared/city-routing/city-slug.ts`
- Test: `kizuna-core/src/shared/city-routing/city-slug.test.ts`

**Interfaces:**
- Produces:
  - `type RoutableCity = { ibge: string; name: string; state: string; stateName: string }`
  - `CITY_COOKIE = 'kz_city'`
  - `RESERVED_SLUGS: ReadonlySet<string>`
  - `citySlug(name: string, state: string): string`
  - `isRoutableSlug(slug: string): boolean`
  - `cityPath(city: { name: string; state: string }, rest?: string): string`
  - `serviceHref(r: { uid: string; city?: string | null; state?: string | null }): string`
  - `findCityBySlug(cities: RoutableCity[], slug: string): RoutableCity | undefined`
  - `findCityByIbge(cities: RoutableCity[], ibge: string): RoutableCity | undefined`
  - `findCityByNameState(cities: RoutableCity[], name: string, state: string): RoutableCity | undefined`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import {
  CITY_COOKIE,
  cityPath,
  citySlug,
  findCityByIbge,
  findCityByNameState,
  findCityBySlug,
  isRoutableSlug,
  serviceHref,
  type RoutableCity,
} from './city-slug';

const CUIABA: RoutableCity = {
  ibge: '5103403',
  name: 'Cuiabá',
  state: 'MT',
  stateName: 'Mato Grosso',
};
const VG: RoutableCity = {
  ibge: '5108402',
  name: 'Várzea Grande',
  state: 'MT',
  stateName: 'Mato Grosso',
};
const CITIES = [CUIABA, VG];

describe('citySlug', () => {
  it('tira acento, minusculiza e sufixa a UF', () => {
    expect(citySlug('Cuiabá', 'MT')).toBe('cuiaba-mt');
    expect(citySlug('Várzea Grande', 'MT')).toBe('varzea-grande-mt');
    expect(citySlug("Alta Floresta D'Oeste", 'ro')).toBe('alta-floresta-d-oeste-ro');
  });
});

describe('isRoutableSlug', () => {
  it('aceita cidade-uf e rejeita reservados e formatos inválidos', () => {
    expect(isRoutableSlug('cuiaba-mt')).toBe(true);
    expect(isRoutableSlug('cuiaba')).toBe(false);
    expect(isRoutableSlug('busca')).toBe(false);
    expect(isRoutableSlug('registre-se')).toBe(false);
    expect(isRoutableSlug('Cuiaba-MT')).toBe(false);
    expect(isRoutableSlug('')).toBe(false);
  });
});

describe('cityPath', () => {
  it('monta o caminho com sufixo opcional', () => {
    expect(cityPath(CUIABA)).toBe('/cuiaba-mt');
    expect(cityPath(CUIABA, '/anuncio/abc')).toBe('/cuiaba-mt/anuncio/abc');
  });
});

describe('serviceHref', () => {
  it('usa o caminho canônico quando há cidade e UF, senão o legado', () => {
    expect(serviceHref({ uid: 'abc', city: 'Cuiabá', state: 'MT' })).toBe('/cuiaba-mt/anuncio/abc');
    expect(serviceHref({ uid: 'abc', city: null, state: 'MT' })).toBe('/anuncios/abc');
    expect(serviceHref({ uid: 'abc' })).toBe('/anuncios/abc');
  });
});

describe('buscas na lista', () => {
  it('acha por slug, ibge e nome+UF (sem acento/caixa)', () => {
    expect(findCityBySlug(CITIES, 'varzea-grande-mt')).toBe(VG);
    expect(findCityBySlug(CITIES, 'sinop-mt')).toBeUndefined();
    expect(findCityBySlug(CITIES, 'busca')).toBeUndefined();
    expect(findCityByIbge(CITIES, '5103403')).toBe(CUIABA);
    expect(findCityByNameState(CITIES, 'VARZEA GRANDE', 'mt')).toBe(VG);
    expect(findCityByNameState(CITIES, 'Cuiabá', 'SP')).toBeUndefined();
  });
});

it('expõe o nome do cookie', () => {
  expect(CITY_COOKIE).toBe('kz_city');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd kizuna-core && npx vitest run src/shared/city-routing/city-slug.test.ts`
Expected: FAIL (módulo `./city-slug` não existe).

- [ ] **Step 3: Write minimal implementation**

```ts
/**
 * Cidade na URL. O slug é derivado de nome + UF (`Cuiabá/MT` -> `cuiaba-mt`) — sem coluna no
 * banco — e SEMPRE leva a UF, pra não mudar se uma homônima entrar na lista depois (link fixo).
 * Puro e sem dependências: usado pelo servidor (rotas, loader) e pelo cliente (cards, cookie).
 */

export type RoutableCity = { ibge: string; name: string; state: string; stateName: string };

/** Cookie espelho da cidade salva (valor = slug), lido no servidor pra redirecionar `/`. */
export const CITY_COOKIE = 'kz_city';

/** Primeiros segmentos de rota do app: nunca podem ser slug de cidade. */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  'api',
  'painel',
  'login',
  'registre-se',
  'esqueci-senha',
  'redefinir-senha',
  'busca',
  'descobrir',
  'curtidos',
  'anuncios',
  'anuncio',
  'sitemap.xml',
  'robots.txt',
]);

const SLUG_SHAPE = /^[a-z0-9]+(-[a-z0-9]+)*-[a-z]{2}$/;

const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

const fold = (s: string) => strip(s).trim().toLowerCase();

export function citySlug(name: string, state: string): string {
  const base = strip(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${base}-${state.trim().toLowerCase()}`;
}

export function isRoutableSlug(slug: string): boolean {
  return SLUG_SHAPE.test(slug) && !RESERVED_SLUGS.has(slug);
}

export function cityPath(city: { name: string; state: string }, rest = ''): string {
  return `/${citySlug(city.name, city.state)}${rest}`;
}

/** Link do card: canônico quando o resultado traz cidade e UF, senão o legado (que redireciona). */
export function serviceHref(r: { uid: string; city?: string | null; state?: string | null }): string {
  const city = r.city?.trim();
  const state = r.state?.trim();
  return city && state ? cityPath({ name: city, state }, `/anuncio/${r.uid}`) : `/anuncios/${r.uid}`;
}

export function findCityBySlug(cities: RoutableCity[], slug: string): RoutableCity | undefined {
  if (!isRoutableSlug(slug)) return undefined;
  return cities.find((c) => citySlug(c.name, c.state) === slug);
}

export function findCityByIbge(cities: RoutableCity[], ibge: string): RoutableCity | undefined {
  return cities.find((c) => c.ibge === ibge);
}

export function findCityByNameState(
  cities: RoutableCity[],
  name: string,
  state: string
): RoutableCity | undefined {
  const n = fold(name);
  const s = fold(state);
  return cities.find((c) => fold(c.name) === n && fold(c.state) === s);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd kizuna-core && npx vitest run src/shared/city-routing/city-slug.test.ts`
Expected: PASS (todos os testes).

- [ ] **Step 5: Checkpoint**

Sem commit (regra do projeto). Seguir para a Task 2.

---

### Task 2: Cidade canônica do anúncio no loader de detalhe (core)

**Files:**
- Create: `kizuna-core/src/server/services/service-city.ts`
- Test: `kizuna-core/src/server/services/service-city.test.ts`
- Modify: `kizuna-core/src/server/services/service-detail-data.ts` (tipo `ServiceDetailData`, `loadServiceDetail`)

**Interfaces:**
- Consumes: `RoutableCity`, `findCityByIbge`, `findCityByNameState` (Task 1); `listLocationCities` de `../location`; `serverFetchResource` de `../postgrest-crud`.
- Produces:
  - `pickServiceCity(addresses: ServiceAddressLike[], provider: { city?: string | null; state?: string | null } | null, cities: RoutableCity[]): RoutableCity | null`
  - `ServiceDetailData.city: RoutableCity | null`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { pickServiceCity } from './service-city';
import type { RoutableCity } from '../../shared/city-routing/city-slug';

const CUIABA: RoutableCity = {
  ibge: '5103403',
  name: 'Cuiabá',
  state: 'MT',
  stateName: 'Mato Grosso',
};
const VG: RoutableCity = {
  ibge: '5108402',
  name: 'Várzea Grande',
  state: 'MT',
  stateName: 'Mato Grosso',
};
const CITIES = [CUIABA, VG];

describe('pickServiceCity', () => {
  it('prefere o endereço principal', () => {
    const city = pickServiceCity(
      [
        { cityIbge: '5103403', isPrimary: false },
        { cityIbge: '5108402', isPrimary: true },
      ],
      null,
      CITIES
    );
    expect(city).toBe(VG);
  });

  it('aceita as colunas em snake_case', () => {
    expect(pickServiceCity([{ city_ibge: '5103403', is_primary: true }], null, CITIES)).toBe(
      CUIABA
    );
  });

  it('ignora endereço fora da lista e cai no próximo', () => {
    const city = pickServiceCity(
      [
        { cityIbge: '3550308', isPrimary: true },
        { cityIbge: '5103403', isPrimary: false },
      ],
      null,
      CITIES
    );
    expect(city).toBe(CUIABA);
  });

  it('sem endereço usa a cidade do prestador (nome + UF)', () => {
    expect(pickServiceCity([], { city: 'cuiaba', state: 'mt' }, CITIES)).toBe(CUIABA);
  });

  it('sem nenhuma pista devolve null', () => {
    expect(pickServiceCity([], null, CITIES)).toBeNull();
    expect(pickServiceCity([], { city: 'Sinop', state: 'MT' }, CITIES)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd kizuna-core && npx vitest run src/server/services/service-city.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Write minimal implementation**

`kizuna-core/src/server/services/service-city.ts`:

```ts
import {
  findCityByIbge,
  findCityByNameState,
  type RoutableCity,
} from '../../shared/city-routing/city-slug';

/** Linha de `service_addresses` — aceita camelCase (mapOutput) e snake_case (PostgREST cru). */
export type ServiceAddressLike = {
  cityIbge?: string | null;
  city_ibge?: string | null;
  isPrimary?: boolean | null;
  is_primary?: boolean | null;
};

const ibgeOf = (a: ServiceAddressLike) => String(a.cityIbge ?? a.city_ibge ?? '').trim();
const primaryOf = (a: ServiceAddressLike) => Boolean(a.isPrimary ?? a.is_primary);

/**
 * Cidade canônica do anúncio (a da URL fixa): endereço principal na lista de cidades atendidas;
 * senão o primeiro endereço que esteja na lista; senão a cidade do perfil do prestador; senão
 * `null` (o anúncio fica só em `/anuncios/[uid]`).
 */
export function pickServiceCity(
  addresses: ServiceAddressLike[],
  provider: { city?: string | null; state?: string | null } | null,
  cities: RoutableCity[]
): RoutableCity | null {
  const ordered = [...addresses].sort((a, b) => Number(primaryOf(b)) - Number(primaryOf(a)));
  for (const address of ordered) {
    const ibge = ibgeOf(address);
    if (!ibge) continue;
    const city = findCityByIbge(cities, ibge);
    if (city) return city;
  }
  if (provider?.city && provider.state) {
    return findCityByNameState(cities, provider.city, provider.state) ?? null;
  }
  return null;
}
```

Em `kizuna-core/src/server/services/service-detail-data.ts`:

1. Acrescentar os imports no topo:

```ts
import { listLocationCities } from '../location';
import type { RoutableCity } from '../../shared/city-routing/city-slug';
import { pickServiceCity, type ServiceAddressLike } from './service-city';
```

2. Acrescentar `city` ao tipo:

```ts
export type ServiceDetailData = {
  service: ServiceRecord;
  subcategoryNames: string[];
  provider: ProviderProfile | null;
  extraFields: ServiceExtraFields;
  related: RelatedResult;
  randomServices: ServiceResult[];
  /** Cidade canônica do anúncio (URL fixa `/[cidade]/anuncio/[uid]`); `null` = sem cidade resolvível. */
  city: RoutableCity | null;
};
```

3. Acrescentar o loader (antes de `loadServiceDetail`):

```ts
/** Endereços + lista de cidades atendidas → cidade canônica (ver `pickServiceCity`). */
async function fetchServiceCity(
  service: ServiceRecord,
  provider: ProviderProfile | null
): Promise<RoutableCity | null> {
  const [addresses, cities] = await Promise.all([
    serverFetchResource<ServiceAddressLike>(
      'service_addresses',
      { service_id: service.id, active: 'true' },
      { auth: null, limit: 50, orderBy: 'is_primary', orderDirection: 'desc' }
    ).catch(() => []),
    listLocationCities(null)
      .then((items) =>
        items.map((c) => ({
          ibge: c.value,
          name: c.label,
          state: c.stateCode,
          stateName: c.stateName,
        }))
      )
      .catch(() => []),
  ]);
  return pickServiceCity(addresses, provider, cities);
}
```

4. Em `loadServiceDetail`, trocar o `return` final:

```ts
  const city = await fetchServiceCity(service, provider);

  return { service, subcategoryNames, provider, extraFields, related, randomServices, city };
```

- [ ] **Step 4: Run tests + type-check**

Run: `cd kizuna-core && npx vitest run src/server/services/service-city.test.ts && npx tsc --noEmit`
Expected: PASS; `tsc` sem erro. Se `tsc` apontar outro lugar que monta `ServiceDetailData` (ex.: teste/mock), acrescentar `city: null` ali.

- [ ] **Step 5: Checkpoint**

Sem commit.

---

### Task 3: Contexto da cidade em exibição + seletor com confirmação (core)

**Files:**
- Create: `kizuna-core/src/client/components/viewing-city.tsx`
- Test: `kizuna-core/src/client/components/viewing-city.test.tsx`
- Modify: `kizuna-core/src/client/components/location-modal.tsx`
- Modify (test): `kizuna-core/src/client/components/location-modal.test.tsx` (acrescentar casos)

**Interfaces:**
- Produces:
  - `type ViewingCity = { cityId: number; cityName: string; stateCode: string; stateName: string }`
  - `ViewingCityProvider({ children })`
  - `ViewingCityMarker({ city, onConfirm? })` — renderiza `null`; registra a cidade e o callback no provider enquanto montado.
  - `useViewingCity(): ViewingCity | null`
  - `useViewingCityConfirm(): ((loc: UserLocation) => void) | undefined`
- Consumes: `UserLocation` de `../hooks/use-user-location`.

- [ ] **Step 1: Write the failing test do contexto**

`viewing-city.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ViewingCityMarker, ViewingCityProvider, useViewingCity } from './viewing-city';

const VG = { cityId: 5108402, cityName: 'Várzea Grande', stateCode: 'MT', stateName: 'Mato Grosso' };

function Probe() {
  const viewing = useViewingCity();
  return <p data-testid="probe">{viewing ? viewing.cityName : 'nenhuma'}</p>;
}

afterEach(cleanup);

describe('ViewingCity', () => {
  it('sem marcador não há cidade em exibição', () => {
    render(
      <ViewingCityProvider>
        <Probe />
      </ViewingCityProvider>
    );
    expect(screen.getByTestId('probe').textContent).toBe('nenhuma');
  });

  it('o marcador publica a cidade e limpa ao desmontar', () => {
    const { rerender } = render(
      <ViewingCityProvider>
        <ViewingCityMarker city={VG} />
        <Probe />
      </ViewingCityProvider>
    );
    expect(screen.getByTestId('probe').textContent).toBe('Várzea Grande');

    rerender(
      <ViewingCityProvider>
        <Probe />
      </ViewingCityProvider>
    );
    expect(screen.getByTestId('probe').textContent).toBe('nenhuma');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd kizuna-core && npx vitest run src/client/components/viewing-city.test.tsx`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implement `viewing-city.tsx`**

```tsx
'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { UserLocation } from '../hooks/use-user-location';

/**
 * Cidade "em exibição": a que a URL está mostrando (ex.: `/varzea-grande-mt/anuncio/x`),
 * que pode diferir da cidade salva do usuário. O `LocationTrigger` mostra esta no topo e o
 * `LocationModal` entra em modo de confirmação quando ela difere da salva. Sem provider/marcador
 * nada muda: `useViewingCity()` devolve `null`.
 */

export type ViewingCity = {
  cityId: number;
  cityName: string;
  stateCode: string;
  stateName: string;
};

type Entry = { city: ViewingCity; onConfirm?: (loc: UserLocation) => void };
type Ctx = { entry: Entry | null; setEntry: (entry: Entry | null) => void };

const ViewingCityContext = createContext<Ctx>({ entry: null, setEntry: () => {} });

export function ViewingCityProvider({ children }: { children: ReactNode }) {
  const [entry, setEntry] = useState<Entry | null>(null);
  const value = useMemo(() => ({ entry, setEntry }), [entry]);
  return <ViewingCityContext.Provider value={value}>{children}</ViewingCityContext.Provider>;
}

export function useViewingCity(): ViewingCity | null {
  return useContext(ViewingCityContext).entry?.city ?? null;
}

/** Chamado pelo seletor depois de gravar uma cidade (qualquer modo) enquanto há cidade em exibição. */
export function useViewingCityConfirm(): ((loc: UserLocation) => void) | undefined {
  return useContext(ViewingCityContext).entry?.onConfirm;
}

export function ViewingCityMarker({
  city,
  onConfirm,
}: {
  city: ViewingCity;
  onConfirm?: (loc: UserLocation) => void;
}) {
  const { setEntry } = useContext(ViewingCityContext);
  const confirmRef = useRef(onConfirm);
  confirmRef.current = onConfirm;
  const { cityId, cityName, stateCode, stateName } = city;

  useEffect(() => {
    setEntry({
      city: { cityId, cityName, stateCode, stateName },
      onConfirm: (loc) => confirmRef.current?.(loc),
    });
    return () => setEntry(null);
  }, [cityId, cityName, stateCode, stateName, setEntry]);

  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd kizuna-core && npx vitest run src/client/components/viewing-city.test.tsx`
Expected: PASS.

- [ ] **Step 5: Write the failing test do modal (modo de confirmação)**

Acrescentar ao final de `location-modal.test.tsx` (mantém os imports e `ITEMS` já existentes; acrescentar `vi` já importado e os imports abaixo no topo do arquivo):

```tsx
import { ViewingCityMarker, ViewingCityProvider } from './viewing-city';
```

```tsx
describe('LocationModal — modo de confirmação (cidade em exibição ≠ salva)', () => {
  const SAVED = {
    stateCode: 'MT',
    stateName: 'Mato Grosso',
    cityId: 5100005,
    cityName: 'Cuiabá',
    source: 'manual',
  };
  const VIEWING = {
    cityId: 5100011,
    cityName: 'Várzea Grande',
    stateCode: 'MT',
    stateName: 'Mato Grosso',
  };

  beforeEach(() => {
    localStorage.setItem('user_location', JSON.stringify(SAVED));
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/location/resolve')) {
          const { source: _source, ...resolved } = SAVED;
          return new Response(JSON.stringify({ location: resolved }), { status: 200 });
        }
        return new Response(JSON.stringify({ items: ITEMS }), { status: 200 });
      })
    );
  });

  function setup(onConfirm = vi.fn()) {
    render(
      <ViewingCityProvider>
        <ViewingCityMarker city={VIEWING} onConfirm={onConfirm} />
        <LocationModal open onClose={() => {}} />
      </ViewingCityProvider>
    );
    return onConfirm;
  }

  it('pré-seleciona a cidade salva e só grava ao confirmar', async () => {
    const onConfirm = setup();
    const confirm = await screen.findByRole('button', { name: /Confirmar Cuiabá/ });
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ cityId: 5100005 }));
  });

  it('clicar numa cidade só seleciona; confirmar grava a escolhida', async () => {
    const onConfirm = setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Sinop – MT' }));
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Confirmar Sinop/ }));
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ cityName: 'Sinop' }));
  });

  it('"Ficar em" grava a cidade em exibição', async () => {
    const onConfirm = setup();
    fireEvent.click(await screen.findByRole('button', { name: /Ficar em Várzea Grande/ }));
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ cityId: 5100011 }));
    expect(JSON.parse(localStorage.getItem('user_location') as string).cityId).toBe(5100011);
  });
});
```

Nota: em `ITEMS` o `value` de cada cidade é `5100000 + índice` (Cuiabá = índice 5 → `5100005`; Sinop = índice 9). O `VIEWING` usa `5100011` (Várzea Grande, índice 11).

- [ ] **Step 6: Run test to verify it fails**

Run: `cd kizuna-core && npx vitest run src/client/components/location-modal.test.tsx`
Expected: os 3 casos novos FALHAM (sem botão "Confirmar"/"Ficar em"); os existentes continuam passando.

- [ ] **Step 7: Implement em `location-modal.tsx`**

1. Imports (topo):

```tsx
import { useUserLocation, type UserLocation } from '../hooks/use-user-location';
import { useViewingCity, useViewingCityConfirm } from './viewing-city';
```

(substitui o import atual de `useUserLocation`).

2. `LocationTrigger`: mostrar a cidade em exibição. Trocar o começo e o miolo do componente:

```tsx
export function LocationTrigger({ onClick }: { onClick: () => void }) {
  const { location, status } = useUserLocation();
  const viewing = useViewingCity();
  const isDetecting = status === 'detecting' && !viewing;
  const shown = viewing
    ? { cityName: viewing.cityName, stateName: viewing.stateName, stateCode: viewing.stateCode, source: 'manual' as const }
    : location;
```

e dentro do `<span className="max-w-[150px] truncate">` trocar todas as referências a `location` por `shown` (`location ? (` → `shown ? (`, `location.cityName` → `shown.cityName`, `location.stateName` → `shown.stateName`, `location.stateCode` → `shown.stateCode`, `location.source === 'ip'` → `shown.source === 'ip'`).

3. `LocationModal`: estado e helpers. Logo após `const { location, setLocation, detectLocation, status } = useUserLocation();` acrescentar:

```tsx
  const viewing = useViewingCity();
  const onViewingConfirm = useViewingCityConfirm();
  // Modo de confirmação: o usuário vê uma cidade (URL) diferente da salva — escolher só seleciona.
  const confirmMode = viewing !== null && location?.cityId !== viewing.cityId;
  const [picked, setPicked] = useState<CityOption | null>(null);

  const savedOption: CityOption | null = location?.cityId
    ? {
        value: String(location.cityId),
        label: location.cityName,
        stateCode: location.stateCode,
        stateName: location.stateName,
      }
    : null;
  const selected = confirmMode ? (picked ?? savedOption) : null;
```

No `useEffect` de reset ao abrir, acrescentar `setPicked(null);` junto de `setSearch('');`.

4. Substituir `handleSelectCity` por:

```tsx
  function commit(city: CityOption) {
    const next: UserLocation = {
      stateCode: city.stateCode,
      stateName: city.stateName,
      cityId: Number(city.value) || 0,
      cityName: city.label,
      source: 'manual',
    };
    setLocation(next);
    onViewingConfirm?.(next);
    onClose();
  }

  function handleSelectCity(city: CityOption) {
    if (confirmMode) setPicked(city);
    else commit(city);
  }
```

5. JSX — logo antes do bloco `{/* Busca */}` acrescentar o atalho "Ficar em":

```tsx
        {confirmMode && viewing ? (
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <span className="text-xs text-muted-foreground">
              Você está vendo <strong className="text-foreground">{viewing.cityName}</strong>
            </span>
            <button
              onClick={() =>
                commit({
                  value: String(viewing.cityId),
                  label: viewing.cityName,
                  stateCode: viewing.stateCode,
                  stateName: viewing.stateName,
                })
              }
              className="inline-flex items-center gap-1.5 rounded-[var(--ui-radius-pill,0.375rem)] border border-input bg-background px-2.5 py-1.5 text-xs text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              Ficar em {viewing.cityName}
            </button>
          </div>
        ) : null}
```

6. Item da lista: destacar a selecionada. Trocar o `className` do botão da cidade por:

```tsx
                className={`flex w-full items-center px-4 py-2.5 text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground ${
                  selected?.value === city.value ? 'bg-accent font-semibold' : ''
                }`}
```

e acrescentar `aria-pressed={selected ? selected.value === city.value : undefined}` ao mesmo botão.

7. Rodapé de confirmação: depois do `</div>` que fecha o bloco `{/* Lista */}` (`overflow-y-auto`), antes do fechamento do diálogo:

```tsx
        {confirmMode ? (
          <div className="border-t border-border px-4 py-3">
            <button
              disabled={!selected}
              onClick={() => selected && commit(selected)}
              className="w-full rounded-[var(--ui-radius-pill,0.375rem)] bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
            >
              Confirmar{selected ? ` ${selected.label}` : ''}
            </button>
          </div>
        ) : null}
```

- [ ] **Step 8: Run tests + type-check**

Run: `cd kizuna-core && npx vitest run src/client/components/location-modal.test.tsx src/client/components/viewing-city.test.tsx && npx tsc --noEmit`
Expected: PASS (existentes + 3 novos); `tsc` limpo.

- [ ] **Step 9: Checkpoint**

Sem commit.

---

### Task 4: Cards e trilhas — href canônico, `showCity`, `cityIbge` (core)

**Files:**
- Modify: `kizuna-core/src/client/components/services/detail/service-carousel.tsx`
- Modify: `kizuna-core/src/client/components/services/detail/service-carousel-section.tsx`
- Modify: `kizuna-core/src/client/components/search/search-results-view.tsx` (linha do `href`)
- Modify: `kizuna-core/src/server/services/category-rail-data.ts`
- Modify (test): `kizuna-core/src/client/components/search/format-location-label.test.ts` (sem mudança de comportamento; só roda como regressão)

**Interfaces:**
- Consumes: `serviceHref` (Task 1), `formatLocationLabel` (existente).
- Produces: `ServiceCarousel`/`ServiceCarouselSection` aceitam `showCity?: boolean` (default `false` = comportamento atual, sem rótulo de local); `loadCategoryRail(slug, { limit?, cityIbge? })`.

- [ ] **Step 1: `loadCategoryRail` aceita `cityIbge`**

Em `category-rail-data.ts`, trocar a assinatura e a chamada de busca:

```ts
export async function loadCategoryRail(
  slug: string,
  options: { limit?: number; cityIbge?: string } = {}
): Promise<CategoryRailData | null> {
```

```ts
  const items = await runServiceSearch(
    { p_category_id: id, p_page_size: limit, p_city_ibge: options.cityIbge ?? null },
    seedFromKey(`rail:${slug}${options.cityIbge ? `:${options.cityIbge}` : ''}`)
  );
```

- [ ] **Step 2: Carrossel — href canônico e `showCity`**

Em `service-carousel.tsx`:

```tsx
import { serviceHref } from '../../../shared/city-routing/city-slug';
import { formatLocationLabel } from '../../search/format-location-label';
```

Acrescentar a prop e repassá-la:

```tsx
export function ServiceCarousel({
  services,
  detailConfig,
  moreHref,
  moreLabel = 'Ver mais',
  showCity = false,
}: {
  services: ServiceResult[];
  detailConfig?: ServiceDetailConfig | null;
  moreHref?: string;
  moreLabel?: string;
  /** Mostra a cidade no card (use em listas globais; dentro de `/[cidade]` ela já está no topo). */
  showCity?: boolean;
}) {
```

No `ListingResultCard`: `href={serviceHref(service)}` e, junto das demais props, `locationLabel={showCity ? formatLocationLabel(service) : null}`.

Em `service-carousel-section.tsx`: acrescentar `showCity?: boolean` ao tipo das props e à desestruturação, e repassar `showCity={showCity}` ao `<ServiceCarousel>`.

- [ ] **Step 3: Busca — href canônico**

Em `search-results-view.tsx`, import e troca de uma linha:

```tsx
import { serviceHref } from '../../../shared/city-routing/city-slug';
```

```tsx
    href: serviceHref(r),
```

(substitui `` href: `/anuncios/${r.uid}`, ``).

- [ ] **Step 4: Verificar tipos e regressão**

Run: `cd kizuna-core && npx tsc --noEmit && npx vitest run src/client/components/search src/client/components/services`
Expected: PASS. Se `ServiceResult` não tiver `city`/`state` tipados, `tsc` acusa em `serviceHref(r)`; nesse caso acrescentar `city?: string | null; state?: string | null` ao tipo `ServiceResult` em `search-types.ts` (a RPC já devolve esses campos — ver `format-location-label.ts`).

- [ ] **Step 5: Checkpoint**

Sem commit.

---

### Task 5: Peças do starter — cidades em cache, cookie, marcador, convite, layout

**Files:**
- Create: `src/lib/server/cities.ts`
- Create: `src/components/city-cookie-sync.tsx`
- Create: `src/components/city-route-marker.tsx`
- Create: `src/components/city-invite.tsx`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Consumes: Tasks 1 e 3.
- Produces:
  - `loadRoutableCities(): Promise<RoutableCity[]>` (cache 300 s)
  - `resolveCitySlug(slug: string): Promise<RoutableCity | undefined>`
  - `CityCookieSync()`
  - `CityRouteMarker({ city: RoutableCity; targetRest?: string })`
  - `CityInvite()`

- [ ] **Step 1: `src/lib/server/cities.ts`**

```ts
import { unstable_cache } from 'next/cache';
import { listLocationCities } from '@kizuna/core/server';
import {
  findCityBySlug,
  type RoutableCity,
} from '@kizuna/core/shared/city-routing/city-slug';

/** Cidades atendidas (`location_city.search_city`), em cache de 5 min — mesma janela das rotas. */
export const loadRoutableCities = unstable_cache(
  async (): Promise<RoutableCity[]> => {
    const items = await listLocationCities(null);
    return items.map((c) => ({
      ibge: c.value,
      name: c.label,
      state: c.stateCode,
      stateName: c.stateName,
    }));
  },
  ['routable-cities'],
  { revalidate: 300 }
);

export async function resolveCitySlug(slug: string): Promise<RoutableCity | undefined> {
  return findCityBySlug(await loadRoutableCities(), slug);
}
```

- [ ] **Step 2: `src/components/city-cookie-sync.tsx`**

```tsx
'use client';

import { useEffect } from 'react';
import { useUserLocation } from '@kizuna/core/client/hooks/use-user-location';
import { CITY_COOKIE, citySlug } from '@kizuna/core/shared/city-routing/city-slug';

/**
 * Espelha a cidade salva (localStorage) no cookie `kz_city`, que o servidor lê em `/` pra
 * redirecionar à cidade do usuário. Só escreve; nunca navega (detecção por IP/GPS não move a tela).
 */
export function CityCookieSync() {
  const { location } = useUserLocation();
  const cityName = location?.cityName;
  const stateCode = location?.stateCode;

  useEffect(() => {
    if (!cityName || !stateCode) return;
    document.cookie = `${CITY_COOKIE}=${citySlug(cityName, stateCode)}; path=/; max-age=31536000; samesite=lax`;
  }, [cityName, stateCode]);

  return null;
}
```

- [ ] **Step 3: `src/components/city-route-marker.tsx`**

```tsx
'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { UserLocation } from '@kizuna/core/client/hooks/use-user-location';
import { ViewingCityMarker } from '@kizuna/core/client/components/viewing-city';
import { cityPath, type RoutableCity } from '@kizuna/core/shared/city-routing/city-slug';

/**
 * Declara "esta página mostra a cidade X" (topo e seletor passam a refletir a URL). Quando o
 * usuário grava outra cidade no seletor, navega pra ela (`targetRest` mantém o sufixo, ex.: a
 * mesma categoria); gravar a própria cidade da URL não navega.
 */
export function CityRouteMarker({
  city,
  targetRest = '',
}: {
  city: RoutableCity;
  targetRest?: string;
}) {
  const router = useRouter();
  const onConfirm = useCallback(
    (loc: UserLocation) => {
      if (String(loc.cityId) === city.ibge) return;
      router.push(cityPath({ name: loc.cityName, state: loc.stateCode }, targetRest));
    },
    [city.ibge, router, targetRest]
  );

  return (
    <ViewingCityMarker
      city={{
        cityId: Number(city.ibge),
        cityName: city.name,
        stateCode: city.state,
        stateName: city.stateName,
      }}
      onConfirm={onConfirm}
    />
  );
}
```

- [ ] **Step 4: `src/components/city-invite.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { MapPin } from 'lucide-react';
import { useUserLocation } from '@kizuna/core/client/hooks/use-user-location';
import { LocationModal } from '@kizuna/core/client/components/location-modal';
import { useViewingCity } from '@kizuna/core/client/components/viewing-city';

/**
 * Convite discreto quando a URL mostra uma cidade diferente da salva: "Ver mais serviços em
 * Cuiabá" (ou "Escolher minha cidade" sem cidade salva). Abre o seletor em modo de confirmação.
 */
export function CityInvite() {
  const { location, ready } = useUserLocation();
  const viewing = useViewingCity();
  const [open, setOpen] = useState(false);

  if (!viewing || !ready) return null;
  if (location && location.cityId === viewing.cityId) return null;

  return (
    <>
      <div className="mx-auto w-full max-w-[1600px] px-4 pt-3 sm:px-6">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
        >
          <MapPin className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          {location?.cityName
            ? `Ver mais serviços em ${location.cityName}`
            : 'Escolher minha cidade'}
        </button>
      </div>
      <LocationModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
```

- [ ] **Step 5: Montar no `src/app/layout.tsx`**

Imports:

```tsx
import { ViewingCityProvider } from '@kizuna/core/client/components/viewing-city';
import { CityCookieSync } from '@/components/city-cookie-sync';
```

Dentro de `<AuthProvider initialUser={null}>`, envolver o conteúdo (o `<PwaRegister ... />` até o `<MobileTabBar ... />`) com `<ViewingCityProvider>...</ViewingCityProvider>` e acrescentar `<CityCookieSync />` logo depois do `<PwaRegister ... />`.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 7: Checkpoint**

Sem commit.

---

### Task 6: Home da cidade, redirect em `/` e `CategoryRails` por cidade (starter)

**Files:**
- Create: `src/components/home-page.tsx` (corpo atual de `src/app/page.tsx`, parametrizado)
- Modify: `src/app/page.tsx`
- Modify: `src/components/home/category-rails.tsx`
- Create: `src/app/[cidade]/layout.tsx`
- Create: `src/app/[cidade]/page.tsx`

**Interfaces:**
- Consumes: Tasks 1, 4, 5.
- Produces: `HomePage({ city }: { city: RoutableCity | null })`; `CategoryRails({ rails, detailConfig, city? })`.

- [ ] **Step 1: `CategoryRails` aceita `city`**

Em `src/components/home/category-rails.tsx`:

```tsx
import { cityPath, type RoutableCity } from '@kizuna/core/shared/city-routing/city-slug';
```

Props e corpo:

```tsx
export async function CategoryRails({
  rails,
  detailConfig,
  city,
}: {
  rails: CategoryRailConfig[];
  detailConfig?: ServiceDetailConfig | null;
  /** Home de uma cidade: filtra as trilhas por ela e esconde a cidade nos cards. */
  city?: RoutableCity | null;
}) {
  const loaded = await Promise.all(
    rails.map((rail) => loadCategoryRail(rail.slug, { ...rail, cityIbge: city?.ibge }))
  );
```

No `ServiceCarouselSection`: acrescentar `showCity={!city}` e trocar o `moreHref` por:

```tsx
            moreHref={
              hasMore
                ? `/busca?categoryId=${category.id}${
                    city
                      ? `&state=${city.state}&cityId=${city.ibge}&cityName=${encodeURIComponent(city.name)}`
                      : ''
                  }`
                : undefined
            }
```

(`cityPath` não é usado aqui — remover da linha de import: importar só o tipo `RoutableCity`.)

- [ ] **Step 2: `src/components/home-page.tsx`**

Mover para cá o conteúdo de `src/app/page.tsx` (as constantes de config e o `JSX` do `Home`), exportando um componente `HomePage` async-safe (continua Server Component) com a prop `city`:

```tsx
import { HomeContent } from '@/components/home-content';
import cfg from '@/../kizuna.config.json';
import { HOME_INK_LEVELS, type HomeInkLevel } from '@/components/home/home-ink-config';
import { CategoryRails, type CategoryRailConfig } from '@/components/home/category-rails';
import type { ServiceDetailConfig } from '@kizuna/core/client/components/services/detail';
import type { RoutableCity } from '@kizuna/core/shared/city-routing/city-slug';

const home = cfg.home as typeof cfg.home & {
  inkPicker?: boolean;
  inkLevel?: number;
  categoriesOnlyWithListings?: boolean;
  categoryRails?: CategoryRailConfig[];
  instagramUrl?: string;
};
const categoryRails = (home?.categoryRails ?? []).filter((rail) => rail?.slug);
const serviceDetailConfig = (cfg as { serviceDetail?: ServiceDetailConfig }).serviceDetail ?? null;
const inkLevel = HOME_INK_LEVELS.includes(home?.inkLevel as HomeInkLevel)
  ? (home.inkLevel as HomeInkLevel)
  : undefined;

export function HomePage({ city }: { city: RoutableCity | null }) {
  return (
    <HomeContent
      showHero={cfg.home?.showHero !== false}
      categoriesVariant={cfg.home?.categoriesVariant === 'compact' ? 'compact' : 'classic'}
      categoriesOnlyWithListings={home?.categoriesOnlyWithListings === true}
      showDiscover={cfg.home?.showDiscover === true}
      inkPicker={home?.inkPicker !== false}
      inkLevel={inkLevel}
      instagramUrl={home?.instagramUrl || undefined}
      categoryRails={
        categoryRails.length > 0 ? (
          <CategoryRails rails={categoryRails} detailConfig={serviceDetailConfig} city={city} />
        ) : null
      }
    />
  );
}
```

(Se o `src/app/page.tsx` atual tiver comentário de cabeçalho, manter o comentário no novo arquivo.)

- [ ] **Step 3: `src/app/page.tsx` — home global com redirect pelo cookie**

```tsx
// Home global. Com o cookie `kz_city` apontando pra uma cidade atendida, vai pra home dela
// (`/[cidade]`); sem cookie (ou cidade que saiu da lista) mostra a home global — sem loop.
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { CITY_COOKIE } from '@kizuna/core/shared/city-routing/city-slug';
import { HomePage } from '@/components/home-page';
import { resolveCitySlug } from '@/lib/server/cities';

export default async function Home() {
  const slug = (await cookies()).get(CITY_COOKIE)?.value;
  if (slug && (await resolveCitySlug(slug))) redirect(`/${slug}`);
  return <HomePage city={null} />;
}
```

- [ ] **Step 4: `src/app/[cidade]/layout.tsx`**

```tsx
import { CityInvite } from '@/components/city-invite';

// A validação da cidade fica em cada página (o detalhe redireciona em vez de 404).
export default function CityLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <CityInvite />
      {children}
    </>
  );
}
```

- [ ] **Step 5: `src/app/[cidade]/page.tsx`**

```tsx
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { buildMetadata } from '@kizuna/core/server';
import { cityPath } from '@kizuna/core/shared/city-routing/city-slug';
import { HomePage } from '@/components/home-page';
import { CityRouteMarker } from '@/components/city-route-marker';
import { SEO_SITE } from '@/lib/seo';
import { resolveCitySlug } from '@/lib/server/cities';

type Props = { params: Promise<{ cidade: string }> };

export const revalidate = 300;
export const dynamicParams = true;

export function generateStaticParams(): { cidade: string }[] {
  return [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { cidade } = await params;
  const city = await resolveCitySlug(cidade);
  if (!city) return { title: 'Cidade não encontrada' };
  return buildMetadata(SEO_SITE, {
    title: `Serviços em ${city.name}, ${city.state}`,
    description: `Encontre e contrate prestadores de serviço em ${city.name}, com filtros por categoria e preço.`,
    path: cityPath(city),
    image: null,
  });
}

export default async function CityHomePage({ params }: Props) {
  const { cidade } = await params;
  const city = await resolveCitySlug(cidade);
  if (!city) notFound();

  return (
    <>
      <CityRouteMarker city={city} />
      <HomePage city={city} />
    </>
  );
}
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: sem erros. Conferir a assinatura de `buildMetadata` (`@kizuna/core/server`); no detalhe atual ela recebe `{ title, description, path, image }`.

- [ ] **Step 7: Checkpoint**

Sem commit.

---

### Task 7: Detalhe canônico, legado e sitemap (starter)

**Files:**
- Create: `src/lib/anuncio-detail.tsx`
- Create: `src/app/[cidade]/anuncio/[uid]/page.tsx`
- Modify: `src/app/anuncios/[uid]/page.tsx`
- Modify: `src/app/sitemap.ts`

**Interfaces:**
- Consumes: `ServiceDetailData.city` (Task 2), `CityRouteMarker` (Task 5), `cityPath`/`citySlug` (Task 1).
- Produces: `loadAd(uid)` (cache 5 min), `anuncioMetadata(data, path)`, `AnuncioDetail({ data, path })`.

- [ ] **Step 1: `src/lib/anuncio-detail.tsx` — corpo compartilhado**

Mover de `src/app/anuncios/[uid]/page.tsx` o que é comum às duas rotas:

```tsx
import { unstable_cache } from 'next/cache';
import type { Metadata } from 'next';
import {
  loadServiceDetail,
  buildMetadata,
  serviceJsonLd,
  breadcrumbJsonLd,
  jsonLdScript,
  stripHtml,
  type ServiceDetailData,
} from '@kizuna/core/server';
import {
  ServiceDetailPage,
  type ServiceDetailConfig,
} from '@kizuna/core/client/components/services/detail';
import { photosFor } from '@kizuna/core/client/components/services/service-helpers';
import { cityPath } from '@kizuna/core/shared/city-routing/city-slug';
import { SEO_SITE } from '@/lib/seo';
import { trackRule } from '@/lib/analytics';
import cfg from '../../kizuna.config.json';

const serviceDetailConfig: ServiceDetailConfig | null =
  (cfg as { serviceDetail?: ServiceDetailConfig }).serviceDetail ?? null;

/**
 * Carrega tudo que a página precisa num único cache por uid (ISR de 5 min — leitura 100% anônima
 * e pública; um anúncio editado aparece em até 5 min). `notFound()` fica fora daqui: não pode
 * rodar dentro de `unstable_cache`.
 */
export const loadAd = unstable_cache((uid: string) => loadServiceDetail(uid), ['anuncio-detalhe'], {
  revalidate: 300,
});

export function anuncioMetadata(data: ServiceDetailData, path: string): Metadata {
  const photos = photosFor(data.service);
  return buildMetadata(SEO_SITE, {
    title: data.service.title,
    description:
      stripHtml(data.service.description) ||
      `${data.service.title} — veja detalhes no ${SEO_SITE.name}.`,
    path,
    image: photos[0] ?? null,
  });
}

export function AnuncioDetail({ data, path }: { data: ServiceDetailData; path: string }) {
  const photos = photosFor(data.service);

  const serviceLd = serviceJsonLd(SEO_SITE, {
    name: data.service.title,
    description: stripHtml(data.service.description),
    path,
    image: photos[0] ?? null,
    price: data.service.priceUnit !== 'quote' ? data.service.startingPrice : null,
    category: data.service.category?.name ?? null,
    providerName: data.provider?.full_name || data.provider?.display_name || null,
  });
  const breadcrumbLd = breadcrumbJsonLd(SEO_SITE, [
    { name: 'Início', path: '/' },
    ...(data.city ? [{ name: data.city.name, path: cityPath(data.city) }] : []),
    { name: 'Buscar', path: '/busca' },
    { name: data.service.title, path },
  ]);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(serviceLd) }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbLd) }}
      />
      {/* Sem `slots` por enquanto: este projeto ainda não tem plugin de chat/solicitar — a sidebar
          mostra só preço + compartilhar + prestador. Ver `ServiceDetailSlots` pra plugar CTAs. */}
      <ServiceDetailPage
        data={data}
        detailConfig={serviceDetailConfig}
        path={path}
        analytics={{ viewRule: trackRule('service', 'view') }}
      />
    </>
  );
}
```

Se `ServiceDetailData` não for exportado por `@kizuna/core/server`, importar de `@kizuna/core/server/services/service-detail-data`.

- [ ] **Step 2: Rota canônica `src/app/[cidade]/anuncio/[uid]/page.tsx`**

```tsx
import { notFound, permanentRedirect } from 'next/navigation';
import type { Metadata } from 'next';
import { cityPath, citySlug } from '@kizuna/core/shared/city-routing/city-slug';
import { AnuncioDetail, anuncioMetadata, loadAd } from '@/lib/anuncio-detail';
import { CityRouteMarker } from '@/components/city-route-marker';

type Props = { params: Promise<{ cidade: string; uid: string }> };

export const revalidate = 300;
export const dynamicParams = true;

export function generateStaticParams(): { cidade: string; uid: string }[] {
  return [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { uid } = await params;
  const data = await loadAd(uid);
  if (!data) return { title: 'Anúncio não encontrado' };
  const path = data.city ? cityPath(data.city, `/anuncio/${data.service.uid}`) : `/anuncios/${data.service.uid}`;
  return anuncioMetadata(data, path);
}

/**
 * Link fixo do anúncio: a cidade da URL é SEMPRE a cidade real dele. URL com cidade errada
 * redireciona pra cidade certa; anúncio sem cidade resolvível volta pro legado (que o renderiza).
 */
export default async function CityAnuncioPage({ params }: Props) {
  const { cidade, uid } = await params;
  const data = await loadAd(uid);
  if (!data) notFound();

  if (!data.city) permanentRedirect(`/anuncios/${data.service.uid}`);
  if (citySlug(data.city.name, data.city.state) !== cidade) {
    permanentRedirect(cityPath(data.city, `/anuncio/${data.service.uid}`));
  }

  return (
    <>
      <CityRouteMarker city={data.city} />
      <AnuncioDetail data={data} path={cityPath(data.city, `/anuncio/${data.service.uid}`)} />
    </>
  );
}
```

Nota de tipos: `permanentRedirect` é `never`, então depois do `if (!data.city)` o TS estreita `data.city` para não-nulo.

- [ ] **Step 3: Legado `src/app/anuncios/[uid]/page.tsx`**

Substituir o arquivo inteiro por:

```tsx
import { notFound, permanentRedirect } from 'next/navigation';
import type { Metadata } from 'next';
import { cityPath } from '@kizuna/core/shared/city-routing/city-slug';
import { AnuncioDetail, anuncioMetadata, loadAd } from '@/lib/anuncio-detail';

type Props = { params: Promise<{ uid: string }> };

export const revalidate = 300;
export const dynamicParams = true;

export function generateStaticParams(): { uid: string }[] {
  return [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { uid } = await params;
  const data = await loadAd(uid);
  if (!data) return { title: 'Anúncio não encontrado' };
  return anuncioMetadata(data, `/anuncios/${data.service.uid}`);
}

/**
 * Rota legada. Anúncio com cidade resolvível redireciona (permanente) pro link canônico
 * `/[cidade]/anuncio/[uid]`; sem cidade resolvível continua sendo renderizado aqui.
 */
export default async function AnuncioPage({ params }: Props) {
  const { uid } = await params;
  const data = await loadAd(uid);
  if (!data) notFound();

  if (data.city) permanentRedirect(cityPath(data.city, `/anuncio/${data.service.uid}`));

  return <AnuncioDetail data={data} path={`/anuncios/${data.service.uid}`} />;
}
```

- [ ] **Step 4: `src/app/sitemap.ts` — uma URL por cidade**

```ts
import type { MetadataRoute } from 'next';
import cfg from '@/../kizuna.config.json';
import { cityPath } from '@kizuna/core/shared/city-routing/city-slug';
import { loadRoutableCities } from '@/lib/server/cities';

// Páginas públicas. Adicione aqui as rotas públicas do seu app.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const url = cfg.site?.url ?? 'http://localhost:3000';
  const cities = await loadRoutableCities().catch(() => []);
  return [
    { url: `${url}/`, changeFrequency: 'daily', priority: 1 },
    ...cities.map((city) => ({
      url: `${url}${cityPath(city)}`,
      changeFrequency: 'daily' as const,
      priority: 0.8,
    })),
  ];
}
```

- [ ] **Step 5: Type-check e lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sem erros novos.

- [ ] **Step 6: Checkpoint**

Sem commit.

---

### Task 8: Verificação ponta a ponta

**Files:** nenhum (verificação).

- [ ] **Step 1: Testes do core**

Run: `cd kizuna-core && npx vitest run`
Expected: tudo PASS.

- [ ] **Step 2: Subir o app e checar as regras**

Subir o dev server (preview) e verificar, anotando a evidência de cada item:

1. `GET /cuiaba-mt` (cidade atendida) renderiza a home da cidade; `GET /sinop-xx` e `GET /busca-mt` retornam 404.
2. `GET /anuncios/<uid de anúncio com cidade>` responde 308 para `/<cidade>/anuncio/<uid>`.
3. `GET /outra-cidade-mt/anuncio/<uid>` (cidade errada) responde 308 para a cidade real.
4. Anúncio sem cidade resolvível: `/anuncios/<uid>` renderiza (200) e `/<qualquer>/anuncio/<uid>` redireciona para ele (sem loop).
5. Com cookie `kz_city=cuiaba-mt` e localStorage de Cuiabá: `/` redireciona para `/cuiaba-mt`; sem cookie `/` mostra a home global; cookie com slug inválido é ignorado.
6. Em `/varzea-grande-mt/anuncio/<uid>` com Cuiabá salva: topo mostra Várzea Grande, aparece "Ver mais serviços em Cuiabá"; clicar abre o seletor com Cuiabá pré-selecionada e "Ficar em Várzea Grande"; confirmar Cuiabá navega para `/cuiaba-mt`; "Ficar em Várzea Grande" grava e permanece.
7. Abrir um link de outra cidade com Cuiabá salva **não** troca o cookie/`user_location`.
8. Detecção por IP no primeiro acesso grava o cookie e não navega.
9. `/sitemap.xml` lista uma URL por cidade atendida.
10. Cards da busca (`/busca`) e da home global mostram o link `/<cidade>/anuncio/<uid>` quando há cidade; na home da cidade os cards não mostram a cidade.

- [ ] **Step 3: Resultado**

Registrar quais itens passaram e quais falharam (com a saída observada). Não declarar concluído sem a evidência dos itens 1 a 7.

- [ ] **Step 4: Checkpoint final**

Sem commit; o usuário decide quando commitar (core e starter juntos, conforme a regra do projeto).
