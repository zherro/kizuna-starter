# Gostei e Favorito Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Botões Gostei e Favoritar (ícone/label configuráveis) no card flutuante do detalhe do anúncio, via `/api/resources`.

**Architecture:** A tabela `service_swipes` vira `service_user_favorites` (+ colunas `favorite`, `uid`); um resource `service_reactions` expõe a linha do usuário (RLS por dono); `services.like_count` é mantido por trigger. O componente `ServiceReactionButtons` (core) lê/grava pelo resource e usa `RequireAuthProvider`/`useRequireAuth` para o gate de login em modal.

**Tech Stack:** Next.js, React, vitest + testing-library (jsdom), Postgres/PostgREST (plugins SQL em `kizuna-core/plugins`), lucide-react.

**Spec:** `docs/superpowers/specs/2026-10-01-gostei-e-favorito-design.md`

## Global Constraints

- **Não commitar** (regra do usuário: commit só sob comando). Nenhum passo deste plano faz `git commit`.
- Nenhuma RPC nova. Acesso só por `/api/resources` (skill `criar-recurso`).
- Nada específico do app no core além do que o spec define; config via `kizuna.config.json`.
- `favorite ⇒ action = 'like'`; desgostar zera `favorite`.
- Visitante: Gostei/Favoritar abre `AuthModal` e mantém a página; a ação é aplicada após o login.
- O Tailwind varre `.md`: não escreva classes CSS inválidas/inventadas neste plano nem em docs (use só classes já usadas no código).
- Os arquivos SQL de plugin são reaplicáveis (idempotentes): editar `0001_swipe.sql`/`0002_swipe_addresses.sql` no lugar (em vez de criar `0003`), com guarda de rename no topo. Isto substitui o "0003" citado no spec.
- Código/trabalho do core fica em `kizuna-core/` (submódulo); projeto em `src/`, `kizuna.config.json`, `db/`.
- Testes do core: `cd kizuna-core && npx vitest run <arquivo>`; tipos: `npx tsc --noEmit` (core e raiz).

---

### Task 1: Banco — rename, colunas, trigger e `like_count`

**Files:**
- Modify: `kizuna-core/plugins/swipe/0001_swipe.sql`
- Modify: `kizuna-core/plugins/swipe/0002_swipe_addresses.sql`
- Modify: `kizuna-core/db/extras/swipe_test_smoke.sql`
- Create/Modify: migração em `kizuna-core/plugins/services/` que adiciona `services.like_count` (inspecione a pasta e siga a numeração/convenção; reaplicável com `ADD COLUMN IF NOT EXISTS`)
- Modify: `db/public.sql` (projeto) e `kizuna-core/bundle/plugins-schema.sql` — descubra como são gerados (veja `kizuna-core/STATUS.md`/CLI `kizuna`); se houver comando de bundle, rode-o; senão replique as mesmas mudanças manualmente. Não execute contra banco.
- Modify: `kizuna-core/plugins/README.md`, `kizuna-core/docs/plugins/README.md` (nome da tabela)

**Interfaces:**
- Produces: tabela `public.service_user_favorites(uid uuid unique default gen_random_uuid(), user_id uuid default auth.fun_auth_user_id(), service_uid, action, favorite boolean, updated_at)`; coluna `services.like_count integer not null default 0`.

- [ ] **Step 1: Guarda de rename + colunas no topo de `0001_swipe.sql`** (antes do `CREATE TABLE`), e trocar todas as ocorrências de `service_swipes` por `service_user_favorites` no arquivo (índice `service_swipes_liked_idx` → `service_user_favorites_liked_idx`, policy `service_swipes_owner` → `service_user_favorites_owner`, constraint `service_swipes_pkey` → `service_user_favorites_pkey`):

```sql
DO $$
BEGIN
  IF to_regclass('public.service_swipes') IS NOT NULL
     AND to_regclass('public.service_user_favorites') IS NULL THEN
    ALTER TABLE public.service_swipes RENAME TO service_user_favorites;
    ALTER INDEX IF EXISTS public.service_swipes_liked_idx RENAME TO service_user_favorites_liked_idx;
    ALTER TABLE public.service_user_favorites RENAME CONSTRAINT service_swipes_pkey TO service_user_favorites_pkey;
    DROP POLICY IF EXISTS service_swipes_owner ON public.service_user_favorites;
  END IF;
END $$;
```

Depois do `CREATE TABLE IF NOT EXISTS public.service_user_favorites (...)` (mesmas colunas de hoje), adicionar:

```sql
ALTER TABLE public.service_user_favorites
  ADD COLUMN IF NOT EXISTS uid uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS favorite boolean NOT NULL DEFAULT false;
ALTER TABLE public.service_user_favorites ALTER COLUMN user_id SET DEFAULT auth.fun_auth_user_id();
CREATE UNIQUE INDEX IF NOT EXISTS service_user_favorites_uid_key ON public.service_user_favorites (uid);
ALTER TABLE public.service_user_favorites DROP CONSTRAINT IF EXISTS service_user_favorites_fav_implies_like;
ALTER TABLE public.service_user_favorites
  ADD CONSTRAINT service_user_favorites_fav_implies_like CHECK (NOT favorite OR action = 'like');
CREATE INDEX IF NOT EXISTS service_user_favorites_fav_idx
  ON public.service_user_favorites (user_id, updated_at DESC) WHERE favorite;
GRANT SELECT, INSERT, UPDATE ON TABLE public.service_user_favorites TO auth_user;
```

Em `fn_swipe_record`, o `ON CONFLICT ... DO UPDATE SET` passa a ser:
`SET action = EXCLUDED.action, favorite = (EXCLUDED.action = 'like' AND public.service_user_favorites.favorite), updated_at = EXCLUDED.updated_at` (um `skip`/`unlike` zera `favorite`; um `like` preserva). Mantenha a cláusula `WHERE NOT (... action = 'like' AND p_action = 'skip')`.

- [ ] **Step 2: Trigger do contador** (no fim de `0001_swipe.sql`, após `like_count` existir — a coluna vem da migração de `services`, que roda antes por dependência):

```sql
CREATE OR REPLACE FUNCTION public.trg_service_like_count() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d integer := 0; v_uid uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_uid := NEW.service_uid; d := CASE WHEN NEW.action = 'like' THEN 1 ELSE 0 END;
  ELSIF TG_OP = 'DELETE' THEN
    v_uid := OLD.service_uid; d := CASE WHEN OLD.action = 'like' THEN -1 ELSE 0 END;
  ELSE
    v_uid := NEW.service_uid;
    d := (CASE WHEN NEW.action = 'like' THEN 1 ELSE 0 END) - (CASE WHEN OLD.action = 'like' THEN 1 ELSE 0 END);
  END IF;
  IF d <> 0 THEN
    UPDATE public.services SET like_count = GREATEST(like_count + d, 0) WHERE uid = v_uid;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS service_user_favorites_like_count ON public.service_user_favorites;
CREATE TRIGGER service_user_favorites_like_count
  AFTER INSERT OR UPDATE OF action OR DELETE ON public.service_user_favorites
  FOR EACH ROW EXECUTE FUNCTION public.trg_service_like_count();

UPDATE public.services s SET like_count = c.n
FROM (SELECT service_uid, count(*)::int AS n FROM public.service_user_favorites WHERE action = 'like' GROUP BY 1) c
WHERE s.uid = c.service_uid AND s.like_count <> c.n;
```

(`SECURITY DEFINER` é necessário porque `auth_user` não pode dar UPDATE em `services` de terceiros; é função de trigger, não exposta na API.)

- [ ] **Step 3: Migração de `services`**: `ALTER TABLE public.services ADD COLUMN IF NOT EXISTS like_count integer NOT NULL DEFAULT 0;` no plugin `services`.

- [ ] **Step 4: `0002_swipe_addresses.sql`, `swipe_test_smoke.sql`, READMEs, bundles/`db/public.sql`**: trocar `service_swipes` → `service_user_favorites` (use Grep `service_swipes` em `kizuna-core/` e `db/` até zerar fora de `docs/superpowers/` e do guard de rename). Estender o smoke SQL com asserts: favoritar via UPDATE de `favorite=true` com `action='skip'` falha no CHECK; `like` incrementa `services.like_count` e `skip` decrementa; `fn_swipe_record(..., 'unlike')` zera `favorite`.

- [ ] **Step 5: Verificação**: `Grep service_swipes` não retorna nada fora do guard e de `docs/superpowers`. Se houver Postgres local disponível (`docker exec -i postgres_local psql ...` como no cabeçalho do smoke), rode a aplicação dos SQLs e o smoke e relate; senão, relate "SQL não executado".

---

### Task 2: Resource `service_reactions` + `likeCount` no serviço

**Files:**
- Modify: `kizuna-core/src/client/components/screen-engine/resources/swipe.ts`
- Create: `kizuna-core/src/client/components/screen-engine/resources/swipe.test.ts`
- Modify: `kizuna-core/src/client/components/screen-engine/resources/services.ts` (select + mapOutput)
- Modify: `kizuna-core/src/client/components/services/service-type.ts` (`likeCount: number`)
- Modify: `src/lib/server/resources.ts` (spread do novo resource)

**Interfaces:**
- Produces: export `resourceServiceReactions: Record<string, ResourceConfig>` (chave `service_reactions`); item de saída `{ uid: string; serviceUid: string; liked: boolean; favorite: boolean }`; `ServiceRecord.likeCount: number`.

- [ ] **Step 1: Teste falhando** (`swipe.test.ts`):

```ts
import { describe, it, expect } from 'vitest';
import { resourceServiceReactions } from './swipe';

const cfg = resourceServiceReactions.service_reactions;

describe('service_reactions', () => {
  it('favorito implica gostei', () => {
    expect(cfg.mapInput!({ serviceUid: 'u1', liked: false, favorite: true })).toEqual({
      service_uid: 'u1', action: 'like', favorite: true,
    });
  });
  it('sem gostei vira skip e sem favorito', () => {
    expect(cfg.mapInput!({ serviceUid: 'u1', liked: false, favorite: false })).toEqual({
      service_uid: 'u1', action: 'skip', favorite: false,
    });
  });
  it('mapOutput converte a linha', () => {
    expect(cfg.mapOutput!({ uid: 'x', service_uid: 'u1', action: 'like', favorite: false })).toEqual({
      uid: 'x', serviceUid: 'u1', liked: true, favorite: false,
    });
  });
  it('lê pelo uid e exige login', () => {
    expect(cfg.primaryKey).toBe('uid');
    expect(cfg.table).toBe('service_user_favorites');
    expect(cfg.listRequiresAuth).not.toBe(false);
  });
});
```

- [ ] **Step 2:** `cd kizuna-core && npx vitest run src/client/components/screen-engine/resources/swipe.test.ts` → FAIL (export inexistente).

- [ ] **Step 3: Implementar** em `swipe.ts` (mantendo `rpcSwipe`), importando `ResourceConfig` de `'../types/resource-config'`:

```ts
export const resourceServiceReactions: Record<string, ResourceConfig> = {
  service_reactions: {
    schema: 'public',
    table: 'service_user_favorites',
    select: 'uid,service_uid,action,favorite',
    primaryKey: 'uid',
    defaultOrder: 'updated_at.desc',
    searchableColumns: [],
    requiredFields: ['service_uid'],
    mapInput: (input) => {
      const favorite = input.favorite === true;
      const liked = favorite || input.liked === true;
      return { service_uid: input.serviceUid, action: liked ? 'like' : 'skip', favorite };
    },
    mapOutput: (r) => ({
      uid: String(r.uid ?? ''),
      serviceUid: String(r.service_uid ?? ''),
      liked: r.action === 'like',
      favorite: Boolean(r.favorite),
    }),
  },
};
```

Confira o caminho exato do tipo `ResourceConfig` olhando os imports de `resources/services.ts`. Se `requiredFields` for validado após `mapInput`, a chave `service_uid` está correta.

- [ ] **Step 4:** em `resources/services.ts` adicionar `like_count` ao `select` (depois de `sponsored`) e `likeCount: Number(record.like_count ?? 0)` ao `mapOutput` (veja o objeto retornado e siga o estilo); em `service-type.ts` adicionar `likeCount: number;` ao `ServiceRecord` e `likeCount: 0` ao objeto default (≈linha 127) e a qualquer fixture que o tipo quebrar (`npx tsc --noEmit`).

- [ ] **Step 5:** `src/lib/server/resources.ts`: importar `resourceServiceReactions` de `@kizuna/core/client/components/screen-engine/resources/swipe` e fazer spread em `postgrestResources` (ao lado de `...rpcSwipe` em `postgrestRpcs`, que continua).

- [ ] **Step 6:** rodar o teste (PASS) e `npx tsc --noEmit` no core e na raiz.

---

### Task 3: Componente `ServiceReactionButtons` + integração no detalhe

**Files:**
- Create: `kizuna-core/src/client/components/services/detail/reaction-api.ts`
- Create: `kizuna-core/src/client/components/services/detail/service-reaction-buttons.tsx`
- Create: `kizuna-core/src/client/components/services/detail/service-reaction-buttons.test.tsx`
- Modify: `kizuna-core/src/client/components/services/detail/category-style.ts` (tipo `reactions` em `ServiceDetailConfig`)
- Modify: `kizuna-core/src/client/components/services/detail/service-detail-page.tsx` (renderizar após `renderCTA`, antes do `AdShareButton`)

**Interfaces:**
- Consumes: resource `service_reactions` (Task 2); `ServiceRecord.likeCount`.
- Produces: `ReactionButtonConfig = { icon?: string; label?: string; labelActive?: string }`; `ServiceDetailConfig.reactions?: { like?: ReactionButtonConfig; favorite?: ReactionButtonConfig }`; `<ServiceReactionButtons serviceUid likeCount config trackUid? />`.

- [ ] **Step 1: `reaction-api.ts`**:

```ts
export type Reaction = { uid: string | null; liked: boolean; favorite: boolean };
const EMPTY: Reaction = { uid: null, liked: false, favorite: false };

type Item = { uid: string; liked: boolean; favorite: boolean };

/** Estado do usuário no anúncio. Visitante (401) e erro de rede = "nada marcado". */
export async function fetchReaction(serviceUid: string): Promise<Reaction> {
  try {
    const res = await fetch(
      `/api/resources/service_reactions?filter.service_uid=${encodeURIComponent(serviceUid)}&pageSize=1`
    );
    if (!res.ok) return EMPTY;
    const data = (await res.json().catch(() => null)) as { items?: Item[] } | null;
    const row = data?.items?.[0];
    return row ? { uid: row.uid, liked: row.liked, favorite: row.favorite } : EMPTY;
  } catch {
    return EMPTY;
  }
}

/** Grava o estado completo (update regrava o registro todo). Descobre POST x PATCH relendo a linha. */
export async function saveReaction(
  serviceUid: string,
  next: { liked: boolean; favorite: boolean }
): Promise<Reaction> {
  const current = await fetchReaction(serviceUid);
  const body = JSON.stringify({ serviceUid, liked: next.liked, favorite: next.favorite });
  const res = await fetch(
    current.uid ? `/api/resources/service_reactions/${current.uid}` : '/api/resources/service_reactions',
    { method: current.uid ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body }
  );
  if (!res.ok) throw new Error(`service_reactions ${res.status}`);
  const data = (await res.json().catch(() => null)) as { item?: Item } | null;
  return {
    uid: data?.item?.uid ?? current.uid,
    liked: next.liked || next.favorite,
    favorite: next.favorite,
  };
}
```

- [ ] **Step 2: Teste falhando** (`service-reaction-buttons.test.tsx`; mocke `reaction-api`, `useAuth` de `../../../providers/auth-provider` e `useToast` de `../../../hooks/use-toast`; para o gate, mocke `../../auth/require-auth` com `RequireAuthProvider: ({children}) => children` e `useRequireAuth: () => requireAuth` onde `requireAuth = vi.fn((fn) => fn())` por padrão). Casos:
  1. estado inicial vem de `fetchReaction` quando há usuário; botões mostram `labelActive` quando marcados; contador inicial = `likeCount`;
  2. clicar Gostei → `saveReaction(uid, {liked:true,favorite:false})` e contador +1 (otimista);
  3. clicar Favoritar → `saveReaction(uid, {liked:true,favorite:true})` e Gostei fica ativo;
  4. com Favorito ativo, clicar Gostei → `saveReaction(uid, {liked:false,favorite:false})` (desfavorita);
  5. `saveReaction` rejeita → estado volta ao anterior e `toast.error` é chamado;
  6. visitante (`requireAuth` mockado como "não executa") → `saveReaction` não é chamado e `requireAuth` foi chamado;
  7. `config={{ like: { icon: 'ThumbsUp' } }}` sem `favorite` → só o botão Gostei existe; `config` undefined → nada renderizado.
  Use `render`, `screen.getByRole('button', { name: /gostei/i })`, `fireEvent.click`, `waitFor`, `cleanup` no `afterEach`, `// @vitest-environment jsdom` no topo (padrão de `swipe-liked-page.test.tsx`).

- [ ] **Step 3:** rodar → FAIL (componente inexistente).

- [ ] **Step 4: Implementar** `service-reaction-buttons.tsx` (`'use client'`):

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { Heart, ThumbsUp } from 'lucide-react';
import { Button } from '../../ui/button';
import { useToast } from '../../../hooks/use-toast';
import { useAuth } from '../../../providers/auth-provider';
import { trackEvent } from '../../../analytics/analytics-api';
import { resolveLucideIcon } from '../../../../lib/lucide-icon';
import { RequireAuthProvider, useRequireAuth } from '../../auth/require-auth';
import { fetchReaction, saveReaction, type Reaction } from './reaction-api';
import type { ReactionButtonConfig } from './category-style';

type Props = {
  serviceUid: string;
  likeCount: number;
  config?: { like?: ReactionButtonConfig; favorite?: ReactionButtonConfig } | null;
  /** quando informado, conta o evento `favorite` (plugin analytics) ao favoritar. */
  trackUid?: string;
};

const NONE: Reaction = { uid: null, liked: false, favorite: false };

function Inner({ serviceUid, likeCount, config, trackUid }: Props) {
  const { user } = useAuth();
  const requireAuth = useRequireAuth();
  const toast = useToast();
  const [state, setState] = useState<Reaction>(NONE);
  const [count, setCount] = useState(likeCount);
  const busy = useRef(false);

  useEffect(() => {
    if (!user) {
      setState(NONE);
      return;
    }
    let alive = true;
    fetchReaction(serviceUid).then((r) => alive && setState(r));
    return () => {
      alive = false;
    };
  }, [user, serviceUid]);

  async function apply(next: { liked: boolean; favorite: boolean }) {
    if (busy.current) return;
    busy.current = true;
    const prev = state;
    const prevCount = count;
    setState({ ...prev, ...next });
    setCount(prevCount + (next.liked ? 1 : 0) - (prev.liked ? 1 : 0));
    try {
      const saved = await saveReaction(serviceUid, next);
      setState(saved);
      if (next.favorite && !prev.favorite && trackUid) {
        trackEvent({ entityType: 'service', entityId: trackUid, event: 'favorite' });
      }
    } catch {
      setState(prev);
      setCount(prevCount);
      toast.error('Não foi possível salvar. Tente novamente.');
    } finally {
      busy.current = false;
    }
  }

  const toggleLike = () =>
    requireAuth(() =>
      apply(state.liked ? { liked: false, favorite: false } : { liked: true, favorite: state.favorite })
    );
  const toggleFavorite = () =>
    requireAuth(() =>
      apply(state.favorite ? { liked: state.liked, favorite: false } : { liked: true, favorite: true })
    );

  const like = config?.like;
  const favorite = config?.favorite;
  if (!like && !favorite) return null;

  const LikeIcon = resolveLucideIcon(like?.icon) ?? ThumbsUp;
  const FavIcon = resolveLucideIcon(favorite?.icon) ?? Heart;

  return (
    <div className="flex gap-2">
      {like && (
        <Button variant="outline" className="flex-1" onClick={toggleLike} aria-pressed={state.liked}>
          <LikeIcon className={state.liked ? 'mr-2 h-4 w-4 fill-current' : 'mr-2 h-4 w-4'} />
          {state.liked ? (like.labelActive ?? like.label ?? 'Gostei') : (like.label ?? 'Gostei')}
          {count > 0 && <span className="ml-1 text-muted-foreground">{count}</span>}
        </Button>
      )}
      {favorite && (
        <Button
          variant="outline"
          className="flex-1"
          onClick={toggleFavorite}
          aria-pressed={state.favorite}
        >
          <FavIcon className={state.favorite ? 'mr-2 h-4 w-4 fill-current' : 'mr-2 h-4 w-4'} />
          {state.favorite
            ? (favorite.labelActive ?? favorite.label ?? 'Favoritado')
            : (favorite.label ?? 'Favoritar')}
        </Button>
      )}
    </div>
  );
}

export function ServiceReactionButtons(props: Props) {
  return (
    <RequireAuthProvider>
      <Inner {...props} />
    </RequireAuthProvider>
  );
}
```

Confira que `Button` aceita `variant="outline"` (veja `ui/button`); se não, use o variant equivalente existente. Ajuste o texto dos testes se `name` do botão incluir o contador (use regex `/gostei/i`).

- [ ] **Step 5:** em `category-style.ts` adicionar (e reexportar em `service-detail-types.ts` junto de `ServiceDetailConfig`):

```ts
export type ReactionButtonConfig = {
  /** Nome de ícone lucide-react (ex. "Heart"); inválido cai no ícone padrão do botão. */
  icon?: string;
  label?: string;
  labelActive?: string;
};
```
e em `ServiceDetailConfig`: `reactions?: { like?: ReactionButtonConfig; favorite?: ReactionButtonConfig };`.

- [ ] **Step 6:** em `service-detail-page.tsx`, dentro do `<div className="mt-5 space-y-2">`, entre `renderCTA` e `AdShareButton`:

```tsx
<ServiceReactionButtons
  serviceUid={service.uid}
  likeCount={service.likeCount ?? 0}
  config={detailConfig?.reactions}
  trackUid={analytics ? service.uid : undefined}
/>
```
(use o nome real da prop/variável de config que o componente já recebe; importe o componente.) O card é o mesmo no desktop (sticky) e no mobile (empilhado), então nada mais é necessário para os dois layouts.

- [ ] **Step 7:** `npx vitest run src/client/components/services/detail` → PASS; `npx tsc --noEmit`.

---

### Task 4: Config, docs e verificação final

**Files:**
- Modify: `kizuna.config.json` e `kizuna-core/starter/kizuna.config.json` (em `serviceDetail`, mais atualizar o `_comment` explicando `reactions`)
- Modify: `kizuna-core/docs/interface/componentes.md` (seção do gate de login: citar o uso no detalhe) e a doc do plugin swipe em `kizuna-core/docs/plugins/` (resource `service_reactions`, tabela renomeada, `like_count`)
- Modify: `kizuna-core/plugins/swipe/shell/manifest.json` `_comment` (registrar também `resourceServiceReactions` em `postgrestResources`)

- [ ] **Step 1:** adicionar em `serviceDetail` dos dois JSONs:

```json
"reactions": {
  "like":     { "icon": "ThumbsUp", "label": "Gostei",    "labelActive": "Gostei" },
  "favorite": { "icon": "Heart",    "label": "Favoritar", "labelActive": "Favoritado" }
}
```
e ampliar o `_comment` com: `"reactions": botões Gostei/Favoritar do detalhe (plugin swipe) — icon (nome lucide-react), label, labelActive; remova um bloco para esconder o botão.` O JSON precisa continuar válido.

- [ ] **Step 2:** docs conforme a lista acima (texto simples, sem classes CSS).

- [ ] **Step 3: Verificação**: `npx tsc --noEmit` na raiz e em `kizuna-core`; `cd kizuna-core && npx vitest run` (relate falhas pré-existentes separadamente de novas); `node -e "JSON.parse(require('fs').readFileSync('kizuna.config.json','utf8'))"` nos dois JSONs; `Grep service_swipes` (só pode sobrar o guard de rename e `docs/superpowers`). Se possível, subir o dev server (`preview_start`) numa página `/anuncios/<uid>` e conferir os botões; se não houver banco rodando, relate que a verificação visual não foi feita.
