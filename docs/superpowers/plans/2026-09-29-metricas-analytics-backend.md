# Métricas do anunciante (plugin analytics) — Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Coletar (first-party, sem cookie) e servir as métricas de negócio por anúncio — impressões, visualizações, cliques no contato, favoritos, compartilhamentos, origem — para o painel do anunciante, com o tempo mínimo de visualização configurável em milissegundos.

**Architecture:** Segue o padrão do core, sem rota `/api` nova e com o mínimo de objetos no banco: **uma tabela** (`analytics_events`, uma linha por visitante/entidade/evento/dia, com RLS e CHECKs) e **uma única função** (`fn_analytics_track`, INVOKER, ~10 linhas) — necessária porque o CRUD genérico (`createResource`) exige login e a maioria dos visitantes é anônima; a RPC com `requiresAuth:false` é o caminho do framework (como `swipe`). Sem views, sem funções de leitura, sem rollup: a leitura é o resource `analytics_events` (`listResource`, RLS pelo dono do anúncio) e a agregação roda no cliente com uma função pura testada. Registro em `postgrestResources`/`postgrestRpcs` do projeto.

**Tech Stack:** Postgres (PostgREST, RLS, CHECK/UNIQUE), Next.js 16 (rota genérica `/api/resources/[resource]` já existente), TypeScript, vitest (+ jsdom no cliente).

**Spec:** não há documento de design separado; o desenho saiu da conversa e está em `src/lib/analytics-metrics.ts` (catálogo/mock) e neste plano.

## Global Constraints

- **Não commitar.** O usuário commita (core + starter) só quando pedir. Os "Checkpoint" são só pausa para revisão.
- **Não criar rotas `/api` novas** nem route handlers novos. Usar `postgrestResources` / `postgrestRpcs` e a rota genérica `/api/resources/[resource]` já existente (`kizuna-core/docs/arquitetura/api.md`). Config de plugin do core = arquivo em `kizuna-core/src/client/components/screen-engine/resources/` (molde: `swipe.ts`, `reviews.ts`), spread no `src/lib/server/resources.ts` do projeto.
- **Evitar funções e views no banco.** Exceção única e justificada: `fn_analytics_track` (escrita anônima). Nada de trigger, view, função de leitura ou de purge. Regras vão em CHECK/UNIQUE/RLS.
- Seguir os padrões existentes (plugin SQL idempotente com registro em `auth.plugin_registry`, teste vitest ao lado do arquivo). Não repensar padrões; código conciso.
- Paths: core = `kizuna-core/` (submódulo; o starter importa `@kizuna/core/*` → `kizuna-core/src/*`).
- Testes do core: `cd kizuna-core && npx vitest run <caminho>`. Tipos do starter: `npx tsc --noEmit -p .` na raiz.
- Sem cookie e sem dado pessoal: `visitor_hash` é um id aleatório de 32 hex gerado no navegador, **rotacionado por dia UTC** (`localStorage` `kz-vid`); IP e user-agent nunca chegam ao banco.
- O limiar de visualização é regra do **cliente** (bloco `analytics` do config); o banco impõe o piso por CHECK: `view` ≥ 500 ms, `impression` ≥ 200 ms. `config.ts` aplica o mesmo piso (teto 60000).
- Dedupe e anti-spam no banco: `UNIQUE (entity_type, entity_id, event_type, visitor_hash, day)` — no máximo 1 linha por visitante/anúncio/evento/dia (repetido é ignorado). Consequência assumida: `views` = visitantes-dia por anúncio; clique de contato repetido no mesmo dia conta 1. O dono vendo o próprio anúncio não conta (política de INSERT). Automação é filtrada no cliente (`navigator.webdriver`/UA de bot), best-effort.
- Fecha por padrão: evento desligado, automação, limiar não atingido, erro de rede ou violação de CHECK/RLS → não conta, sem quebrar a página.
- Eventos: `impression | view | contact_click | favorite | share`. Origens: `search | home | category | direct | share | other`. Entidade: só `service` por enquanto.
- Fuso: `day` usa `CURRENT_DATE` do banco; janelas do cliente usam UTC. Documentar: banco em UTC.
- Volume (limite conhecido): a agregação lê linhas paginadas (1000/página, no máx. 20 páginas, ordem `id desc`, para quando `day` < início da janela anterior). Se um anunciante passar disso, o plano seguinte introduz rollup. Documentar.
- Métricas sem fonte neste plano (`conversations`, `rating`, `responseTime`, `credits`) saem como `{ value: null, delta: 0 }`. Títulos dos anúncios não vêm daqui: o front junta `entityId` com a lista "Meus serviços".
- Tailwind varre `.md`: não colocar classes CSS inventadas em docs/planos.

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `kizuna-core/plugins/analytics/0001_analytics.sql` (existe — reescrever por completo) | Tabela `analytics_events`, RLS, `fn_analytics_track`, retenção via pg_cron (SQL inline) |
| `kizuna-core/plugins/analytics/0002_analytics_report.sql` (existe — **apagar**) | Não faz mais parte do desenho |
| `kizuna-core/db/extras/analytics_test_smoke.sql` (novo) | Smoke SQL (rollback) com `SET LOCAL ROLE` |
| `kizuna-core/src/shared/analytics/config.ts` (novo) | Tipos, defaults, `parseAnalyticsConfig`, `resolveEventRule` |
| `kizuna-core/src/shared/analytics/aggregate.ts` (novo) | `periodBounds`, `deltaPct`, `buildOwnerStats` |
| `kizuna-core/src/shared/analytics/index.ts` (novo) | Re-exports |
| `kizuna-core/src/client/analytics/visitor.ts` (novo) | `getVisitorId`, `isAutomated` |
| `kizuna-core/src/client/analytics/analytics-api.ts` (novo) | `sendTrack`, `trackEvent`, `fetchOwnerStats` |
| `kizuna-core/src/client/analytics/use-track-view.ts`, `track-view.tsx`, `index.ts` (novos) | Hook (ms/ratio/aba visível/uma vez por sessão), wrapper, barrel |
| `kizuna-core/src/client/components/screen-engine/resources/analytics.ts` (novo) | `resourceAnalytics` (ResourceConfig) + `rpcAnalytics` (RpcConfig) |
| `src/lib/server/resources.ts` (modifica), `src/lib/analytics.ts` (novo) | Spread dos dois; regra resolvida pela config |
| `kizuna.config.json`, `kizuna-core/starter/kizuna.config.json`, `kizuna-core/starter/kizuna.plugins.json` | Bloco `analytics` e plugin listado |
| `kizuna-core/docs/plugins/analytics.md` (novo), `kizuna-core/plugins/README.md` | Documentação |

## Contratos produzidos (para o front)

- Escrita: `POST /api/resources/fn_analytics_track` body `{ p_entity_type, p_entity_id, p_event_type, p_visitor_hash, p_source, p_visible_ms }` (pública; sessão opcional).
- Leitura: `GET /api/resources/analytics_events?page&pageSize&orderBy=id&orderDirection=desc` → `{ items: { entity_id, visitor_hash, day, event_type, source }[], ... }` (autenticado; RLS = anúncios do tenant da sessão). O front usa `fetchOwnerStats(days)`:

```ts
type OwnerStats = {
  days: 7 | 30 | 90;
  from: string; to: string;                 // 'YYYY-MM-DD' (UTC)
  metrics: Record<string, { value: number | null; delta: number }>; // ids do catálogo
  series: { day: string; views: number; contacts: number }[];       // um item por dia, zerado se vazio
  sources: { source: string; total: number; share: number }[];      // só eventos 'view'
  entities: { entityId: string; impressions: number; views: number; favorites: number; contacts: number }[];
};
```

---

### Task 1: SQL — tabela `analytics_events`, RLS e `fn_analytics_track`

**Files:**
- Modify (reescrever por completo): `kizuna-core/plugins/analytics/0001_analytics.sql`
- Delete: `kizuna-core/plugins/analytics/0002_analytics_report.sql` (se existir)
- Create: `kizuna-core/db/extras/analytics_test_smoke.sql`

**Interfaces:**
- Produces: tabela `public.analytics_events(id, entity_type, entity_id, event_type, source, visitor_hash, visible_ms, day, created_at)`; `public.fn_analytics_track(p_entity_type text, p_entity_id uuid, p_event_type text, p_visitor_hash text, p_source text DEFAULT 'direct', p_visible_ms integer DEFAULT 0) RETURNS boolean` (true = registrou, false = já existia).

- [ ] **Step 1: Ler o padrão e o estado atual**

Ler `kizuna-core/plugins/notifications/0001_notifications.sql` (molde de plugin curto) e o `0001_analytics.sql` atual. Conferir no banco (`docker exec -i postgres_local psql -U myuser -d foco_total_db -c "\d public.analytics_daily"`) se o desenho antigo foi aplicado; se sim, o novo arquivo deve começar com `DROP TABLE IF EXISTS public.analytics_daily, public.analytics_visitors_daily CASCADE;` e `DROP FUNCTION IF EXISTS` das funções antigas (`fn_analytics_track(text,uuid,text,text,text)`, `fn_analytics_resolve_owner`, `fn_analytics_purge`, `fn_analytics_owner_report`).

- [ ] **Step 2: Escrever o smoke (falha antes da implementação)**

Criar `kizuna-core/db/extras/analytics_test_smoke.sql`:

```sql
-- Roda: docker exec -i postgres_local psql -U myuser -d foco_total_db < kizuna-core/db/extras/analytics_test_smoke.sql
-- Espera: NOTICE 'analytics OK', sem ERROR, e ROLLBACK no fim. Precisa de 1 serviço ativo.
BEGIN;

DO $$
DECLARE
  v_uid uuid; v_tenant uuid; v_owner uuid; v_ok boolean; v_n integer;
BEGIN
  ASSERT to_regclass('public.analytics_events') IS NOT NULL, 'tabela existe';
  ASSERT EXISTS (SELECT 1 FROM auth.plugin_registry WHERE name = 'analytics'), 'plugin registrado';

  SELECT uid, tenant_id, created_by INTO v_uid, v_tenant, v_owner
    FROM public.services WHERE active LIMIT 1;
  IF v_uid IS NULL THEN RAISE NOTICE 'sem serviço ativo — smoke pulado'; RETURN; END IF;

  -- visitante anônimo (RLS de verdade: SET LOCAL ROLE anon)
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  SET LOCAL ROLE anon;

  v_ok := public.fn_analytics_track('service', v_uid, 'view', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'search', 1600);
  ASSERT v_ok, 'primeira view registra';
  v_ok := public.fn_analytics_track('service', v_uid, 'view', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'search', 1600);
  ASSERT NOT v_ok, 'mesma view no mesmo dia é ignorada';
  v_ok := public.fn_analytics_track('service', v_uid, 'view', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'home', 2000);
  ASSERT v_ok, 'outro visitante registra';
  v_ok := public.fn_analytics_track('service', v_uid, 'contact_click', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'search', 0);
  ASSERT v_ok, 'contato registra sem tempo';

  -- rejeições por CHECK / RLS (cada uma levanta erro)
  BEGIN PERFORM public.fn_analytics_track('service', v_uid, 'view', 'cccccccccccccccccccccccccccccccc', 'search', 100);
        RAISE EXCEPTION 'esperava check_violation (tempo abaixo do piso)';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN PERFORM public.fn_analytics_track('service', v_uid, 'nope', 'cccccccccccccccccccccccccccccccc', 'search', 2000);
        RAISE EXCEPTION 'esperava check_violation (evento)';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN PERFORM public.fn_analytics_track('service', v_uid, 'view', 'curto', 'search', 2000);
        RAISE EXCEPTION 'esperava check_violation (hash)';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN PERFORM public.fn_analytics_track('service', gen_random_uuid(), 'view', 'cccccccccccccccccccccccccccccccc', 'search', 2000);
        RAISE EXCEPTION 'esperava insufficient_privilege (entidade inexistente)';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  -- anon não lê
  BEGIN PERFORM 1 FROM public.analytics_events LIMIT 1;
        RAISE EXCEPTION 'anon não deveria ler';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;

  -- dono não conta o próprio anúncio
  PERFORM set_config('request.jwt.claims',
    json_build_object('role','auth_user','sub',v_owner,'user_id',v_owner,'tenant_id',v_tenant)::text, true);
  SET LOCAL ROLE auth_user;
  BEGIN PERFORM public.fn_analytics_track('service', v_uid, 'view', 'dddddddddddddddddddddddddddddddd', 'direct', 2000);
        RAISE EXCEPTION 'esperava insufficient_privilege (dono)';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  -- dono lê as linhas do próprio anúncio
  SELECT count(*) INTO v_n FROM public.analytics_events WHERE entity_id = v_uid;
  ASSERT v_n >= 3, 'dono lê os 3 eventos';
  RESET ROLE;

  -- outro tenant não vê
  PERFORM set_config('request.jwt.claims',
    json_build_object('role','auth_user','sub',gen_random_uuid(),'user_id',gen_random_uuid(),'tenant_id',gen_random_uuid())::text, true);
  SET LOCAL ROLE auth_user;
  SELECT count(*) INTO v_n FROM public.analytics_events WHERE entity_id = v_uid;
  ASSERT v_n = 0, 'outro tenant não vê';
  RESET ROLE;

  RAISE NOTICE 'analytics OK';
END $$;

ROLLBACK;
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `docker exec -i postgres_local psql -U myuser -d foco_total_db < kizuna-core/db/extras/analytics_test_smoke.sql`
Expected: ERRO/ASSERT (`tabela existe` falha ou tabela inexistente).

- [ ] **Step 4: Reescrever o `0001_analytics.sql`**

Conteúdo (cabeçalho explicando o desenho + o que segue). As políticas dependem de `public.services`, então são criadas dentro de um `DO` guardado por `to_regclass`:

```sql
-- plugins/analytics/0001_analytics.sql
-- Plugin: analytics — métricas de negócio por entidade (hoje: anúncio/`service`), first-party,
-- sem cookie e sem dado pessoal. UMA tabela (uma linha por visitante/entidade/evento/dia) e UMA
-- função (escrita anônima: o CRUD genérico exige login). Sem views, sem rollup, sem trigger:
-- a leitura é o resource `analytics_events` e a agregação roda no cliente.
--
-- Regras em constraints/RLS:
--   * piso de tempo visível: view >= 500 ms, impression >= 200 ms (CHECK)
--   * 1 linha por (entidade, evento, visitante, dia) (UNIQUE) — repetido é ignorado
--   * INSERT só para anúncio ativo que NÃO é do próprio usuário (policy)
--   * SELECT só do dono (tenant do anúncio) (policy)
-- Depende funcionalmente do plugin `services` (as policies referenciam public.services).
-- Retenção: pg_cron inline (sem função) se a extensão existir; senão agendar por fora.
-- Idempotente, from-zero-safe.

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id            bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  entity_type   text        NOT NULL DEFAULT 'service',
  entity_id     uuid        NOT NULL,
  event_type    text        NOT NULL,
  source        text        NOT NULL DEFAULT 'direct',
  visitor_hash  text        NOT NULL,
  visible_ms    integer     NOT NULL DEFAULT 0,
  day           date        NOT NULL DEFAULT CURRENT_DATE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT analytics_events_entity_chk  CHECK (entity_type IN ('service')),
  CONSTRAINT analytics_events_event_chk   CHECK (event_type IN ('impression','view','contact_click','favorite','share')),
  CONSTRAINT analytics_events_source_chk  CHECK (source IN ('search','home','category','direct','share','other')),
  CONSTRAINT analytics_events_hash_chk    CHECK (visitor_hash ~ '^[0-9a-f]{16,64}$'),
  CONSTRAINT analytics_events_ms_chk      CHECK (visible_ms BETWEEN 0 AND 3600000),
  CONSTRAINT analytics_events_min_ms_chk  CHECK (
    (event_type = 'view' AND visible_ms >= 500)
    OR (event_type = 'impression' AND visible_ms >= 200)
    OR event_type NOT IN ('view','impression')
  ),
  CONSTRAINT analytics_events_once_per_day UNIQUE (entity_type, entity_id, event_type, visitor_hash, day)
);
CREATE INDEX IF NOT EXISTS analytics_events_entity_day ON public.analytics_events (entity_id, day DESC);

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON TABLE public.analytics_events TO anon, auth_user;
GRANT SELECT ON TABLE public.analytics_events TO auth_user;
REVOKE UPDATE, DELETE ON TABLE public.analytics_events FROM anon, auth_user;

DO $$
BEGIN
  IF to_regclass('public.services') IS NULL THEN
    RAISE NOTICE 'plugin services ausente — policies de analytics_events não criadas';
    RETURN;
  END IF;

  DROP POLICY IF EXISTS analytics_events_insert ON public.analytics_events;
  CREATE POLICY analytics_events_insert ON public.analytics_events FOR INSERT TO anon, auth_user
  WITH CHECK (
    entity_type = 'service'
    AND EXISTS (
      SELECT 1 FROM public.services s
       WHERE s.uid = analytics_events.entity_id
         AND s.active
         AND s.created_by IS DISTINCT FROM auth.fun_auth_user_id()
    )
  );

  DROP POLICY IF EXISTS analytics_events_select_owner ON public.analytics_events;
  CREATE POLICY analytics_events_select_owner ON public.analytics_events FOR SELECT TO auth_user
  USING (
    EXISTS (
      SELECT 1 FROM public.services s
       WHERE s.uid = analytics_events.entity_id
         AND s.tenant_id = auth.fun_auth_current_tenant_id()
    )
  );
END $$;

-- Única função do plugin: escrita anônima via RPC (createResource exige login).
-- INVOKER: a RLS acima vale. true = registrou; false = já existia hoje (UNIQUE).
DROP FUNCTION IF EXISTS public.fn_analytics_track(text, uuid, text, text, text);
CREATE OR REPLACE FUNCTION public.fn_analytics_track(
  p_entity_type  text,
  p_entity_id    uuid,
  p_event_type   text,
  p_visitor_hash text,
  p_source       text DEFAULT 'direct',
  p_visible_ms   integer DEFAULT 0
)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path = public
AS $$
DECLARE
  v_rows integer;
BEGIN
  INSERT INTO public.analytics_events (entity_type, entity_id, event_type, source, visitor_hash, visible_ms)
  VALUES (p_entity_type, p_entity_id, p_event_type, COALESCE(NULLIF(p_source, ''), 'direct'),
          p_visitor_hash, COALESCE(p_visible_ms, 0))
  ON CONFLICT (entity_type, entity_id, event_type, visitor_hash, day) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_analytics_track(text, uuid, text, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_analytics_track(text, uuid, text, text, text, integer) TO anon, auth_user;

-- Retenção: apaga eventos com mais de 400 dias (SQL inline, sem função). Só com pg_cron.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'analytics_retention';
    PERFORM cron.schedule('analytics_retention', '15 3 * * *',
      'DELETE FROM public.analytics_events WHERE day < CURRENT_DATE - 400');
  ELSE
    RAISE NOTICE 'pg_cron ausente — agendar por fora: DELETE FROM public.analytics_events WHERE day < CURRENT_DATE - 400;';
  END IF;
END $$;

INSERT INTO auth.plugin_registry (name, version)
VALUES ('analytics', '2.0.0')
ON CONFLICT (name) DO UPDATE SET version = EXCLUDED.version;

NOTIFY pgrst, 'reload schema';
```

Apagar o `0002_analytics_report.sql`, se existir. Se o Step 1 mostrou objetos do desenho antigo aplicados, prefixar o arquivo com os `DROP ... IF EXISTS` correspondentes.

- [ ] **Step 5: Aplicar e rodar o smoke**

Run:
```bash
docker exec -i postgres_local psql -U myuser -d foco_total_db < kizuna-core/plugins/analytics/0001_analytics.sql
docker exec -i postgres_local psql -U myuser -d foco_total_db < kizuna-core/db/extras/analytics_test_smoke.sql
```
Expected: `NOTICE:  analytics OK` (ou `sem serviço ativo — smoke pulado`: criar um serviço de teste e repetir) e `ROLLBACK`. Se algum ponto do smoke divergir do comportamento real do Postgres (ex.: código de erro do `ON CONFLICT` com RLS), ajustar o **smoke ou o SQL** com o mínimo de mudança e registrar no relatório. Verificar também que o PostgREST enxerga a função: `curl -s -X POST http://localhost:3004/rpc/fn_analytics_track -H "Content-Type: application/json" -H "Content-Profile: public" -d '{"p_entity_type":"service","p_entity_id":"00000000-0000-0000-0000-000000000000","p_event_type":"view","p_visitor_hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","p_visible_ms":2000}'` deve responder erro de RLS (42501), não "function not found".

- [ ] **Step 6: Checkpoint** — não commitar.

---

### Task 2: Config compartilhada — limiar em ms, defaults e overrides por entidade

**Files:**
- Create: `kizuna-core/src/shared/analytics/config.ts`
- Test: `kizuna-core/src/shared/analytics/config.test.ts`

**Interfaces:**
- Produces: `ANALYTICS_EVENTS`, `ANALYTICS_SOURCES`, `AnalyticsEvent`, `AnalyticsSource`, `EventRule`, `AnalyticsConfig`, `parseAnalyticsConfig(raw: unknown): AnalyticsConfig`, `resolveEventRule(config: AnalyticsConfig, entityType: string, event: AnalyticsEvent): EventRule | null`.

- [ ] **Step 1: Escrever os testes**

Criar `kizuna-core/src/shared/analytics/config.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseAnalyticsConfig, resolveEventRule } from './config';

describe('parseAnalyticsConfig', () => {
  it('sem bloco = habilitado com defaults', () => {
    const c = parseAnalyticsConfig(undefined);
    expect(c.enabled).toBe(true);
    expect(resolveEventRule(c, 'service', 'view')).toEqual({
      minVisibleMs: 1500,
      minVisibleRatio: 0.5,
      oncePerSession: true,
    });
    expect(resolveEventRule(c, 'service', 'contact_click')).toEqual({
      minVisibleMs: 0,
      minVisibleRatio: 0,
      oncePerSession: false,
    });
  });

  it('enabled:false desliga tudo', () => {
    const c = parseAnalyticsConfig({ enabled: false });
    expect(resolveEventRule(c, 'service', 'view')).toBeNull();
  });

  it('events listado liga só os listados', () => {
    const c = parseAnalyticsConfig({ events: { view: { minVisibleMs: 2000 } } });
    expect(resolveEventRule(c, 'service', 'view')?.minVisibleMs).toBe(2000);
    expect(resolveEventRule(c, 'service', 'favorite')).toBeNull();
  });

  it('minVisibleMs abaixo do piso sobe ao piso; acima do teto cai no teto', () => {
    const c = parseAnalyticsConfig({
      events: { view: { minVisibleMs: 10 }, impression: { minVisibleMs: 999999 } },
    });
    expect(resolveEventRule(c, 'service', 'view')?.minVisibleMs).toBe(500);
    expect(resolveEventRule(c, 'service', 'impression')?.minVisibleMs).toBe(60000);
  });

  it('ratio é limitado a 0..1 e valores inválidos caem no default', () => {
    const c = parseAnalyticsConfig({
      events: { view: { minVisibleRatio: 7, minVisibleMs: 'x' } },
    });
    const r = resolveEventRule(c, 'service', 'view')!;
    expect(r.minVisibleRatio).toBe(1);
    expect(r.minVisibleMs).toBe(1500);
  });

  it('override por entidade vence o global e respeita o piso', () => {
    const c = parseAnalyticsConfig({
      entities: { service: { events: { view: { minVisibleMs: 3000 } } } },
    });
    expect(resolveEventRule(c, 'service', 'view')?.minVisibleMs).toBe(3000);
    expect(resolveEventRule(c, 'other', 'view')?.minVisibleMs).toBe(1500);

    const low = parseAnalyticsConfig({
      entities: { service: { events: { view: { minVisibleMs: 1 } } } },
    });
    expect(resolveEventRule(low, 'service', 'view')?.minVisibleMs).toBe(500);
  });

  it('lixo no bloco não quebra', () => {
    expect(() => parseAnalyticsConfig('x')).not.toThrow();
    expect(() => parseAnalyticsConfig({ events: 5, entities: [] })).not.toThrow();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd kizuna-core && npx vitest run src/shared/analytics/config.test.ts`
Expected: FAIL — `Cannot find module './config'`.

- [ ] **Step 3: Implementar**

Criar `kizuna-core/src/shared/analytics/config.ts`:

```ts
/**
 * Bloco `analytics` do kizuna.config.json — quando uma visualização/impressão conta.
 * As regras vivem no CLIENTE (useTrackView); o banco reaplica o piso de tempo por CHECK.
 *
 * {
 *   "enabled": true,
 *   "events": {
 *     "view":          { "minVisibleMs": 1500, "minVisibleRatio": 0.5, "oncePerSession": true },
 *     "contact_click": { "minVisibleMs": 0 }
 *   },
 *   "entities": { "service": { "events": { "view": { "minVisibleMs": 3000 } } } }
 * }
 *
 * `events` presente = só os eventos listados ligam. Ausente = todos com os defaults.
 */

export const ANALYTICS_EVENTS = [
  'impression',
  'view',
  'contact_click',
  'favorite',
  'share',
] as const;
export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

export const ANALYTICS_SOURCES = ['search', 'home', 'category', 'direct', 'share', 'other'] as const;
export type AnalyticsSource = (typeof ANALYTICS_SOURCES)[number];

export type EventRule = {
  /** Tempo contínuo visível (ms) antes de contar. 0 = conta na hora (ações explícitas). */
  minVisibleMs: number;
  /** Fração do elemento na tela (0..1) para considerar "visível". */
  minVisibleRatio: number;
  /** Conta no máximo uma vez por sessão do navegador. */
  oncePerSession: boolean;
};

export type AnalyticsConfig = {
  enabled: boolean;
  events: Partial<Record<AnalyticsEvent, EventRule>>;
  entities: Record<string, Partial<Record<AnalyticsEvent, Partial<EventRule>>>>;
};

/** Espelha os CHECKs de `analytics_events` (view >= 500, impression >= 200). */
export const MIN_VISIBLE_MS_FLOOR: Record<AnalyticsEvent, number> = {
  impression: 200,
  view: 500,
  contact_click: 0,
  favorite: 0,
  share: 0,
};
export const MAX_VISIBLE_MS = 60_000;

const DEFAULT_RULES: Record<AnalyticsEvent, EventRule> = {
  impression: { minVisibleMs: 500, minVisibleRatio: 0.6, oncePerSession: true },
  view: { minVisibleMs: 1500, minVisibleRatio: 0.5, oncePerSession: true },
  contact_click: { minVisibleMs: 0, minVisibleRatio: 0, oncePerSession: false },
  favorite: { minVisibleMs: 0, minVisibleRatio: 0, oncePerSession: false },
  share: { minVisibleMs: 0, minVisibleRatio: 0, oncePerSession: false },
};

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function numOr(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function mergeRule(event: AnalyticsEvent, base: EventRule, raw: unknown): EventRule {
  const o = isObj(raw) ? raw : {};
  return {
    minVisibleMs: clamp(
      numOr(o.minVisibleMs, base.minVisibleMs),
      MIN_VISIBLE_MS_FLOOR[event],
      MAX_VISIBLE_MS
    ),
    minVisibleRatio: clamp(numOr(o.minVisibleRatio, base.minVisibleRatio), 0, 1),
    oncePerSession:
      typeof o.oncePerSession === 'boolean' ? o.oncePerSession : base.oncePerSession,
  };
}

export function parseAnalyticsConfig(raw: unknown): AnalyticsConfig {
  const obj = isObj(raw) ? raw : {};
  const events: AnalyticsConfig['events'] = {};

  if (isObj(obj.events)) {
    for (const event of ANALYTICS_EVENTS) {
      if (event in obj.events) events[event] = mergeRule(event, DEFAULT_RULES[event], obj.events[event]);
    }
  } else {
    for (const event of ANALYTICS_EVENTS) events[event] = { ...DEFAULT_RULES[event] };
  }

  const entities: AnalyticsConfig['entities'] = {};
  if (isObj(obj.entities)) {
    for (const [entityType, entry] of Object.entries(obj.entities)) {
      if (!isObj(entry) || !isObj(entry.events)) continue;
      const overrides: Partial<Record<AnalyticsEvent, Partial<EventRule>>> = {};
      for (const event of ANALYTICS_EVENTS) {
        const o = (entry.events as Record<string, unknown>)[event];
        if (isObj(o)) overrides[event] = o as Partial<EventRule>;
      }
      entities[entityType] = overrides;
    }
  }

  return { enabled: obj.enabled !== false, events, entities };
}

/** Regra efetiva de um evento para uma entidade, ou `null` se o evento está desligado. */
export function resolveEventRule(
  config: AnalyticsConfig,
  entityType: string,
  event: AnalyticsEvent
): EventRule | null {
  if (!config.enabled) return null;
  const base = config.events[event];
  if (!base) return null;
  return mergeRule(event, base, config.entities[entityType]?.[event]);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd kizuna-core && npx vitest run src/shared/analytics/config.test.ts`
Expected: PASS (7 testes).

- [ ] **Step 5: Checkpoint** — não commitar.

---

### Task 3: Agregação pura — períodos, deltas e `OwnerStats` a partir das linhas

**Files:**
- Create: `kizuna-core/src/shared/analytics/aggregate.ts`, `kizuna-core/src/shared/analytics/index.ts`
- Test: `kizuna-core/src/shared/analytics/aggregate.test.ts`

**Interfaces:**
- Consumes: `AnalyticsEvent` de `./config`.
- Produces: `PeriodDays`, `parsePeriodDays(v: string | null): PeriodDays`, `Bounds`, `periodBounds(days, today?): Bounds`, `deltaPct(cur, prev): number`, `AnalyticsRow`, `OwnerStats`, `buildOwnerStats(input: { days: PeriodDays; bounds: Bounds; rows: AnalyticsRow[] }): OwnerStats`.

- [ ] **Step 1: Escrever os testes**

Criar `kizuna-core/src/shared/analytics/aggregate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  buildOwnerStats,
  deltaPct,
  parsePeriodDays,
  periodBounds,
  type AnalyticsRow,
} from './aggregate';

describe('parsePeriodDays', () => {
  it('aceita 7/30/90 e cai em 30', () => {
    expect(parsePeriodDays('7')).toBe(7);
    expect(parsePeriodDays('90')).toBe(90);
    expect(parsePeriodDays('15')).toBe(30);
    expect(parsePeriodDays(null)).toBe(30);
  });
});

describe('periodBounds', () => {
  it('calcula janela atual e anterior em UTC', () => {
    expect(periodBounds(7, new Date('2026-09-29T15:00:00Z'))).toEqual({
      from: '2026-09-23',
      to: '2026-09-29',
      prevFrom: '2026-09-16',
      prevTo: '2026-09-22',
    });
  });
});

describe('deltaPct', () => {
  it('trata base zero', () => {
    expect(deltaPct(10, 0)).toBe(100);
    expect(deltaPct(0, 0)).toBe(0);
  });
  it('arredonda a variação', () => {
    expect(deltaPct(112, 100)).toBe(12);
    expect(deltaPct(96, 100)).toBe(-4);
  });
});

describe('buildOwnerStats', () => {
  const bounds = { from: '2026-09-27', to: '2026-09-29', prevFrom: '2026-09-24', prevTo: '2026-09-26' };
  const A = '0b1d5a1e-7c3e-4a9a-9d0e-2f5f6a7b8c9d';
  const B = '1c2e6b2f-8d4f-4bab-8e1f-3a6a7b8c9d0e';

  const row = (
    day: string,
    event_type: AnalyticsRow['event_type'],
    entity_id = A,
    visitor_hash = 'v1',
    source = 'search'
  ): AnalyticsRow => ({ day, event_type, entity_id, visitor_hash, source });

  const rows: AnalyticsRow[] = [
    // janela atual (27..29)
    ...['a', 'b', 'c', 'd'].map((v) => row('2026-09-28', 'impression', A, v)),
    ...['a', 'b', 'c', 'd'].map((v) => row('2026-09-28', 'impression', B, v)),
    row('2026-09-28', 'view', A, 'a', 'search'),
    row('2026-09-28', 'view', A, 'b', 'search'),
    row('2026-09-29', 'view', B, 'a', 'search'),
    row('2026-09-29', 'view', B, 'c', 'home'),
    row('2026-09-29', 'contact_click', B, 'a'),
    row('2026-09-29', 'favorite', A, 'a'),
    // janela anterior (24..26)
    row('2026-09-25', 'view', A, 'x'),
    row('2026-09-25', 'impression', A, 'x'),
    // fora das duas janelas
    row('2026-09-01', 'view', A, 'old'),
  ];
  const stats = buildOwnerStats({ days: 3, bounds, rows });

  it('conta métricas do período e calcula derivadas', () => {
    expect(stats.metrics.views).toEqual({ value: 4, delta: 300 });
    expect(stats.metrics.impressions).toEqual({ value: 8, delta: 700 });
    expect(stats.metrics.ctr.value).toBe(50);
    expect(stats.metrics.contacts.value).toBe(1);
    expect(stats.metrics.contactRate.value).toBe(25);
    expect(stats.metrics.favorites.value).toBe(1);
    expect(stats.metrics.shares.value).toBe(0);
  });

  it('visitantes únicos = hashes distintos entre as views', () => {
    expect(stats.metrics.uniques.value).toBe(3); // a, b, c
  });

  it('métricas sem fonte saem nulas', () => {
    for (const id of ['conversations', 'rating', 'responseTime', 'credits']) {
      expect(stats.metrics[id]).toEqual({ value: null, delta: 0 });
    }
  });

  it('série tem um item por dia, zerado quando vazio', () => {
    expect(stats.series).toEqual([
      { day: '2026-09-27', views: 0, contacts: 0 },
      { day: '2026-09-28', views: 2, contacts: 0 },
      { day: '2026-09-29', views: 2, contacts: 1 },
    ]);
  });

  it('origens com participação percentual (só views)', () => {
    expect(stats.sources).toEqual([
      { source: 'search', total: 3, share: 75 },
      { source: 'home', total: 1, share: 25 },
    ]);
  });

  it('anúncios ordenados por views', () => {
    expect(stats.entities).toEqual([
      { entityId: A, impressions: 4, views: 2, favorites: 1, contacts: 0 },
      { entityId: B, impressions: 4, views: 2, favorites: 0, contacts: 1 },
    ]);
  });

  it('sem linhas não quebra nem divide por zero', () => {
    const s = buildOwnerStats({ days: 3, bounds, rows: [] });
    expect(s.metrics.ctr).toEqual({ value: 0, delta: 0 });
    expect(s.sources).toEqual([]);
    expect(s.entities).toEqual([]);
    expect(s.series).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd kizuna-core && npx vitest run src/shared/analytics/aggregate.test.ts`
Expected: FAIL — módulo `./aggregate` inexistente.

- [ ] **Step 3: Implementar**

Criar `kizuna-core/src/shared/analytics/aggregate.ts`:

```ts
import type { AnalyticsEvent } from './config';

export type PeriodDays = 7 | 30 | 90;

export function parsePeriodDays(v: string | null): PeriodDays {
  return v === '7' ? 7 : v === '90' ? 90 : 30;
}

export type Bounds = { from: string; to: string; prevFrom: string; prevTo: string };

const DAY_MS = 86_400_000;
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Janela atual (hoje inclusive) e a anterior de mesmo tamanho, em UTC. */
export function periodBounds(days: PeriodDays, today: Date = new Date()): Bounds {
  const t = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return {
    from: isoDay(t - (days - 1) * DAY_MS),
    to: isoDay(t),
    prevFrom: isoDay(t - (2 * days - 1) * DAY_MS),
    prevTo: isoDay(t - days * DAY_MS),
  };
}

export function deltaPct(cur: number, prev: number): number {
  if (prev === 0) return cur > 0 ? 100 : 0;
  return Math.round(((cur - prev) / prev) * 100);
}

/** Linha de `analytics_events` como o resource devolve (uma por visitante/entidade/evento/dia). */
export type AnalyticsRow = {
  entity_id: string;
  visitor_hash: string;
  day: string;
  event_type: AnalyticsEvent;
  source: string;
};

export type OwnerStats = {
  days: PeriodDays;
  from: string;
  to: string;
  metrics: Record<string, { value: number | null; delta: number }>;
  series: { day: string; views: number; contacts: number }[];
  sources: { source: string; total: number; share: number }[];
  entities: {
    entityId: string;
    impressions: number;
    views: number;
    favorites: number;
    contacts: number;
  }[];
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const ratio = (a: number, b: number) => (b > 0 ? round1((a / b) * 100) : 0);

function metricValues(rows: AnalyticsRow[]): Record<string, number> {
  const count = (e: AnalyticsEvent) => rows.filter((r) => r.event_type === e).length;
  const views = count('view');
  const contacts = count('contact_click');
  const impressions = count('impression');
  return {
    impressions,
    views,
    // Hashes rotacionam por dia: "únicos" = visitantes-dia distintos entre as views.
    uniques: new Set(rows.filter((r) => r.event_type === 'view').map((r) => r.visitor_hash)).size,
    ctr: ratio(views, impressions),
    favorites: count('favorite'),
    shares: count('share'),
    contacts,
    contactRate: ratio(contacts, views),
  };
}

const UNSOURCED = ['conversations', 'rating', 'responseTime', 'credits'];

/** Datas 'YYYY-MM-DD' comparam corretamente como string. */
export function buildOwnerStats(input: {
  days: PeriodDays;
  bounds: Bounds;
  rows: AnalyticsRow[];
}): OwnerStats {
  const { days, bounds, rows } = input;
  const current = rows.filter((r) => r.day >= bounds.from && r.day <= bounds.to);
  const previous = rows.filter((r) => r.day >= bounds.prevFrom && r.day <= bounds.prevTo);

  const cur = metricValues(current);
  const prev = metricValues(previous);
  const metrics: OwnerStats['metrics'] = {};
  for (const id of Object.keys(cur)) {
    metrics[id] = { value: cur[id], delta: deltaPct(cur[id], prev[id]) };
  }
  for (const id of UNSOURCED) metrics[id] = { value: null, delta: 0 };

  const start = Date.parse(`${bounds.from}T00:00:00Z`);
  const series: OwnerStats['series'] = Array.from({ length: days }, (_, i) => {
    const day = isoDay(start + i * DAY_MS);
    const ofDay = current.filter((r) => r.day === day);
    return {
      day,
      views: ofDay.filter((r) => r.event_type === 'view').length,
      contacts: ofDay.filter((r) => r.event_type === 'contact_click').length,
    };
  });

  const bySource = new Map<string, number>();
  for (const r of current) {
    if (r.event_type === 'view') bySource.set(r.source, (bySource.get(r.source) ?? 0) + 1);
  }
  const sourceSum = [...bySource.values()].reduce((s, n) => s + n, 0);
  const sources = [...bySource.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([source, total]) => ({
      source,
      total,
      share: sourceSum > 0 ? Math.round((total / sourceSum) * 100) : 0,
    }));

  const byEntity = new Map<string, OwnerStats['entities'][number]>();
  for (const r of current) {
    const slot =
      byEntity.get(r.entity_id) ??
      { entityId: r.entity_id, impressions: 0, views: 0, favorites: 0, contacts: 0 };
    if (r.event_type === 'impression') slot.impressions += 1;
    if (r.event_type === 'view') slot.views += 1;
    if (r.event_type === 'favorite') slot.favorites += 1;
    if (r.event_type === 'contact_click') slot.contacts += 1;
    byEntity.set(r.entity_id, slot);
  }
  const entities = [...byEntity.values()].sort((a, b) => b.views - a.views);

  return { days, from: bounds.from, to: bounds.to, metrics, series, sources, entities };
}
```

Criar `kizuna-core/src/shared/analytics/index.ts`:

```ts
export * from './config';
export * from './aggregate';
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd kizuna-core && npx vitest run src/shared/analytics`
Expected: PASS (config + aggregate). Se o teste de `entities` falhar só na ordem de A/B (empate em views), manter a ordenação estável do `Array.sort` (já é estável) e a ordem de inserção A→B.

- [ ] **Step 5: Checkpoint** — não commitar.

---

### Task 4: Cliente — identidade anônima do visitante, envio e leitura

**Files:**
- Create: `kizuna-core/src/client/analytics/visitor.ts`, `kizuna-core/src/client/analytics/analytics-api.ts`
- Test: `kizuna-core/src/client/analytics/analytics-api.test.ts`

**Interfaces:**
- Consumes: `AnalyticsEvent`, `AnalyticsSource`, `ANALYTICS_SOURCES`, `PeriodDays`, `periodBounds`, `buildOwnerStats`, `AnalyticsRow`, `OwnerStats` de `../../shared/analytics`.
- Produces: `getVisitorId(now?: Date): string` (32 hex, estável no dia UTC), `isAutomated(nav?: Pick<Navigator,'webdriver'|'userAgent'>): boolean`, `TrackPayload = { entityType: string; entityId: string; event: AnalyticsEvent; visibleMs?: number; source?: AnalyticsSource }`, `sendTrack(p: TrackPayload): void`, `trackEvent(p: Omit<TrackPayload,'visibleMs'>): void`, `fetchOwnerStats(days: PeriodDays, signal?: AbortSignal): Promise<OwnerStats>`.

- [ ] **Step 1: Escrever os testes**

Criar `kizuna-core/src/client/analytics/analytics-api.test.ts`:

```ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchOwnerStats, sendTrack, trackEvent } from './analytics-api';
import { getVisitorId, isAutomated } from './visitor';

const ID = '0b1d5a1e-7c3e-4a9a-9d0e-2f5f6a7b8c9d';
const fetchMock = vi.fn();

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockReset().mockResolvedValue(new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('getVisitorId', () => {
  it('gera 32 hex, estável no mesmo dia e novo no dia seguinte', () => {
    const d1 = new Date('2026-09-29T10:00:00Z');
    const id = getVisitorId(d1);
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(getVisitorId(new Date('2026-09-29T23:00:00Z'))).toBe(id);
    expect(getVisitorId(new Date('2026-09-30T00:10:00Z'))).not.toBe(id);
  });
});

describe('isAutomated', () => {
  it('detecta webdriver, UA de bot e UA vazio', () => {
    expect(isAutomated({ webdriver: true, userAgent: 'Mozilla/5.0 Chrome/126' })).toBe(true);
    expect(isAutomated({ webdriver: false, userAgent: 'Googlebot/2.1' })).toBe(true);
    expect(isAutomated({ webdriver: false, userAgent: 'HeadlessChrome/126' })).toBe(true);
    expect(isAutomated({ webdriver: false, userAgent: '' })).toBe(true);
    expect(isAutomated({ webdriver: false, userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/126 Safari/537.36' })).toBe(false);
  });
});

describe('sendTrack / trackEvent', () => {
  it('posta no resource da RPC com os args p_*', () => {
    sendTrack({ entityType: 'service', entityId: ID, event: 'view', visibleMs: 1600.4, source: 'search' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/resources/fn_analytics_track');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      p_entity_type: 'service',
      p_entity_id: ID,
      p_event_type: 'view',
      p_source: 'search',
      p_visible_ms: 1600,
    });
    expect(body.p_visitor_hash).toMatch(/^[0-9a-f]{32}$/);
  });

  it('trackEvent envia visible_ms 0 e origem padrão', () => {
    trackEvent({ entityType: 'service', entityId: ID, event: 'contact_click' });
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body).toMatchObject({ p_event_type: 'contact_click', p_visible_ms: 0, p_source: 'direct' });
  });

  it('não envia em automação', () => {
    vi.stubGlobal('navigator', { webdriver: true, userAgent: 'Mozilla/5.0 Chrome/126' });
    sendTrack({ entityType: 'service', entityId: ID, event: 'view', visibleMs: 2000 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falha de rede não lança', () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    expect(() => trackEvent({ entityType: 'service', entityId: ID, event: 'share' })).not.toThrow();
  });
});

describe('fetchOwnerStats', () => {
  const today = new Date().toISOString().slice(0, 10);
  const page = (items: unknown[]) => new Response(JSON.stringify({ items }), { status: 200 });

  it('lê o resource paginado e agrega', async () => {
    fetchMock.mockResolvedValue(
      page([{ entity_id: ID, visitor_hash: 'a'.repeat(32), day: today, event_type: 'view', source: 'search' }])
    );
    const stats = await fetchOwnerStats(7);
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain('/api/resources/analytics_events?');
    expect(url).toContain('orderBy=id');
    expect(url).toContain('orderDirection=desc');
    expect(stats.metrics.views.value).toBe(1);
    expect(stats.series).toHaveLength(7);
  });

  it('para de paginar ao passar do início da janela anterior', async () => {
    const full = Array.from({ length: 1000 }, (_, i) => ({
      entity_id: ID, visitor_hash: String(i).padStart(32, '0'), day: '2000-01-01', event_type: 'view', source: 'search',
    }));
    fetchMock.mockResolvedValue(page(full));
    await fetchOwnerStats(7);
    expect(fetchMock).toHaveBeenCalledTimes(1); // último item já é anterior à janela
  });

  it('erro HTTP lança', async () => {
    fetchMock.mockResolvedValue(new Response('x', { status: 500 }));
    await expect(fetchOwnerStats(30)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd kizuna-core && npx vitest run src/client/analytics/analytics-api.test.ts`
Expected: FAIL — módulos inexistentes.

- [ ] **Step 3: Implementar**

Criar `kizuna-core/src/client/analytics/visitor.ts`:

```ts
const STORAGE_KEY = 'kz-vid';

const utcDay = (d: Date) => d.toISOString().slice(0, 10);

function randomHex32(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '');
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

let memo: { day: string; id: string } | null = null;

/**
 * Id anônimo do visitante: aleatório, guardado no navegador e trocado a cada dia UTC — não
 * identifica ninguém e não cruza dias. Sem storage (modo privado), vale só na sessão.
 */
export function getVisitorId(now: Date = new Date()): string {
  const day = utcDay(now);
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as { day?: string; id?: string };
      if (saved.day === day && /^[0-9a-f]{32}$/.test(saved.id ?? '')) return saved.id!;
    }
  } catch {
    /* segue para gerar */
  }
  if (memo?.day === day) return memo.id;
  const id = randomHex32();
  memo = { day, id };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ day, id }));
  } catch {
    /* fica só em memória */
  }
  return id;
}

const BOT_UA =
  /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|whatsapp|telegram|curl|wget|python-requests|okhttp/i;

/** Filtro best-effort de automação; robôs que executam JS e mentem no UA passam. */
export function isAutomated(
  nav: Pick<Navigator, 'webdriver' | 'userAgent'> = navigator
): boolean {
  return nav.webdriver === true || !nav.userAgent || BOT_UA.test(nav.userAgent);
}
```

Criar `kizuna-core/src/client/analytics/analytics-api.ts`:

```ts
import {
  ANALYTICS_SOURCES,
  buildOwnerStats,
  periodBounds,
  type AnalyticsEvent,
  type AnalyticsRow,
  type AnalyticsSource,
  type OwnerStats,
  type PeriodDays,
} from '../../shared/analytics';
import { getVisitorId, isAutomated } from './visitor';

export type TrackPayload = {
  entityType: string;
  entityId: string;
  event: AnalyticsEvent;
  visibleMs?: number;
  source?: AnalyticsSource;
};

const TRACK_URL = '/api/resources/fn_analytics_track';
const EVENTS_URL = '/api/resources/analytics_events';
const PAGE_SIZE = 1000;
const MAX_PAGES = 20;

/** Best-effort: sendBeacon (sobrevive a navegação) com fallback para fetch keepalive. */
export function sendTrack(p: TrackPayload): void {
  if (typeof window === 'undefined' || isAutomated()) return;
  const body = JSON.stringify({
    p_entity_type: p.entityType,
    p_entity_id: p.entityId,
    p_event_type: p.event,
    p_visitor_hash: getVisitorId(),
    p_source: p.source && ANALYTICS_SOURCES.includes(p.source) ? p.source : 'direct',
    p_visible_ms: Math.round(p.visibleMs ?? 0),
  });
  try {
    if (
      typeof navigator.sendBeacon === 'function' &&
      navigator.sendBeacon(TRACK_URL, new Blob([body], { type: 'application/json' }))
    ) {
      return;
    }
  } catch {
    /* cai no fetch */
  }
  void fetch(TRACK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {});
}

/** Ação explícita (clique em contato, favorito, compartilhar): conta na hora, sem limiar. */
export function trackEvent(p: Omit<TrackPayload, 'visibleMs'>): void {
  sendTrack({ ...p, visibleMs: 0 });
}

/**
 * Lê `analytics_events` (RLS: só anúncios do tenant da sessão) do mais novo para o mais antigo
 * e para quando passa do início da janela anterior. Limite: MAX_PAGES x PAGE_SIZE linhas.
 */
async function fetchRows(minDay: string, signal?: AbortSignal): Promise<AnalyticsRow[]> {
  const rows: AnalyticsRow[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const qs = new URLSearchParams({
      page: String(page),
      pageSize: String(PAGE_SIZE),
      orderBy: 'id',
      orderDirection: 'desc',
    });
    const res = await fetch(`${EVENTS_URL}?${qs}`, { signal, cache: 'no-store' });
    if (!res.ok) throw new Error(`analytics_events ${res.status}`);
    const data = (await res.json().catch(() => null)) as { items?: AnalyticsRow[] } | null;
    const items = Array.isArray(data?.items) ? data.items : [];
    rows.push(...items);
    const last = items[items.length - 1];
    if (items.length < PAGE_SIZE || !last || last.day < minDay) break;
  }
  return rows;
}

export async function fetchOwnerStats(days: PeriodDays, signal?: AbortSignal): Promise<OwnerStats> {
  const bounds = periodBounds(days);
  const rows = await fetchRows(bounds.prevFrom, signal);
  return buildOwnerStats({ days, bounds, rows });
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd kizuna-core && npx vitest run src/client/analytics/analytics-api.test.ts`
Expected: PASS. Observação: o teste "não envia em automação" troca `navigator` via `vi.stubGlobal`; `sendTrack` lê `navigator` no momento da chamada (o default de `isAutomated` é avaliado a cada chamada), então funciona.

- [ ] **Step 5: Checkpoint** — não commitar.

---

### Task 5: Cliente — `useTrackView` e `<TrackView>`

**Files:**
- Create: `kizuna-core/src/client/analytics/use-track-view.ts`, `kizuna-core/src/client/analytics/track-view.tsx`, `kizuna-core/src/client/analytics/index.ts`
- Test: `kizuna-core/src/client/analytics/use-track-view.test.tsx`

**Interfaces:**
- Consumes: `EventRule`, `AnalyticsEvent`, `AnalyticsSource` (`../../shared/analytics`), `sendTrack` (`./analytics-api`).
- Produces: `TrackViewOptions = { entityType: string; entityId: string; event: AnalyticsEvent; rule: EventRule | null; source?: AnalyticsSource }`, `useTrackView(opts): (el: Element | null) => void`, `<TrackView {...opts}>{children}</TrackView>`, e o barrel `index.ts`. O `rule` chega por prop: o Server Component chama `resolveEventRule(config, 'service', 'view')` e passa adiante.

- [ ] **Step 1: Escrever os testes**

Criar `kizuna-core/src/client/analytics/use-track-view.test.tsx`:

```tsx
// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTrackView } from './use-track-view';

const ID = '0b1d5a1e-7c3e-4a9a-9d0e-2f5f6a7b8c9d';
const rule = { minVisibleMs: 1500, minVisibleRatio: 0.5, oncePerSession: true };

let ioCallback: IntersectionObserverCallback = () => {};
class FakeIO {
  constructor(cb: IntersectionObserverCallback) {
    ioCallback = cb;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}
const setInView = (isIntersecting: boolean) =>
  act(() => ioCallback([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver));

const fetchMock = vi.fn();

function mount(over: Partial<Parameters<typeof useTrackView>[0]> = {}) {
  const hook = renderHook(() =>
    useTrackView({ entityType: 'service', entityId: ID, event: 'view', rule, source: 'search', ...over })
  );
  act(() => hook.result.current(document.createElement('div')));
  return hook;
}

beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.clear();
  fetchMock.mockReset().mockResolvedValue(new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('IntersectionObserver', FakeIO);
  vi.stubGlobal('navigator', { webdriver: false, userAgent: 'Mozilla/5.0 Chrome/126' });
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useTrackView', () => {
  it('envia só depois de minVisibleMs contínuos em tela', () => {
    mount();
    setInView(true);
    act(() => vi.advanceTimersByTime(1499));
    expect(fetchMock).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body).toMatchObject({
      p_entity_type: 'service',
      p_entity_id: ID,
      p_event_type: 'view',
      p_source: 'search',
    });
    expect(body.p_visible_ms).toBeGreaterThanOrEqual(1500);
  });

  it('congela o cronômetro fora da tela e retoma de onde parou', () => {
    mount();
    setInView(true);
    act(() => vi.advanceTimersByTime(1000));
    setInView(false);
    act(() => vi.advanceTimersByTime(10_000));
    expect(fetchMock).not.toHaveBeenCalled();
    setInView(true);
    act(() => vi.advanceTimersByTime(499));
    expect(fetchMock).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('não repete na mesma sessão quando oncePerSession', () => {
    mount();
    setInView(true);
    act(() => vi.advanceTimersByTime(1500));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    mount();
    setInView(true);
    act(() => vi.advanceTimersByTime(5000));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sem regra (evento desligado) não observa nada', () => {
    mount({ rule: null });
    setInView(true);
    act(() => vi.advanceTimersByTime(5000));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd kizuna-core && npx vitest run src/client/analytics/use-track-view.test.tsx`
Expected: FAIL — módulo `./use-track-view` inexistente.

- [ ] **Step 3: Implementar**

Criar `kizuna-core/src/client/analytics/use-track-view.ts`:

```ts
'use client';

import { useEffect, useState } from 'react';
import type { AnalyticsEvent, AnalyticsSource, EventRule } from '../../shared/analytics';
import { sendTrack } from './analytics-api';

export type TrackViewOptions = {
  entityType: string;
  entityId: string;
  event: AnalyticsEvent;
  /** Regra já resolvida no servidor (`resolveEventRule`). `null` = evento desligado. */
  rule: EventRule | null;
  source?: AnalyticsSource;
};

function sessionGet(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}
function sessionSet(key: string) {
  try {
    sessionStorage.setItem(key, '1');
  } catch {
    /* modo privado: pode contar de novo; o UNIQUE do banco absorve */
  }
}

/**
 * Conta a visualização/impressão quando o elemento fica visível (`minVisibleRatio`) por
 * `minVisibleMs` acumulados com a aba em foco. Sai da tela ou troca de aba → congela o
 * cronômetro (não zera). Uso: `const ref = useTrackView(opts); <div ref={ref}>…</div>`.
 */
export function useTrackView(opts: TrackViewOptions): (el: Element | null) => void {
  const [el, setEl] = useState<Element | null>(null);
  const { entityType, entityId, event, rule, source } = opts;
  const minMs = rule?.minVisibleMs ?? 0;
  const ratio = rule?.minVisibleRatio ?? 0;
  const once = rule?.oncePerSession ?? false;
  const enabled = rule !== null;

  useEffect(() => {
    if (!enabled || !el) return;
    const key = `kz-trk:${entityType}:${entityId}:${event}`;
    if (once && sessionGet(key)) return;

    let inView = false;
    let sent = false;
    let accumulated = 0;
    let startedAt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const fire = () => {
      timer = undefined;
      sent = true;
      if (once) sessionSet(key);
      sendTrack({
        entityType,
        entityId,
        event,
        source,
        visibleMs: Math.max(accumulated + (Date.now() - startedAt), minMs),
      });
      cleanup();
    };

    const evaluate = () => {
      if (sent) return;
      const active = inView && document.visibilityState === 'visible';
      if (active && timer === undefined) {
        startedAt = Date.now();
        timer = setTimeout(fire, Math.max(0, minMs - accumulated));
      } else if (!active && timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
        accumulated += Date.now() - startedAt;
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        inView = entries[entries.length - 1]?.isIntersecting ?? false;
        evaluate();
      },
      { threshold: ratio > 0 ? ratio : 0 }
    );
    observer.observe(el);
    document.addEventListener('visibilitychange', evaluate);

    function cleanup() {
      observer.disconnect();
      document.removeEventListener('visibilitychange', evaluate);
      if (timer !== undefined) clearTimeout(timer);
    }
    return cleanup;
  }, [el, enabled, entityType, entityId, event, minMs, ratio, once, source]);

  return setEl;
}
```

Criar `kizuna-core/src/client/analytics/track-view.tsx`:

```tsx
'use client';

import type { ReactNode } from 'react';
import { useTrackView, type TrackViewOptions } from './use-track-view';

/** Envolve um bloco e conta quando ele fica visível pelo tempo configurado. */
export function TrackView({ children, ...opts }: TrackViewOptions & { children: ReactNode }) {
  const ref = useTrackView(opts);
  return <div ref={ref}>{children}</div>;
}
```

Criar `kizuna-core/src/client/analytics/index.ts`:

```ts
export { TrackView } from './track-view';
export { useTrackView, type TrackViewOptions } from './use-track-view';
export { trackEvent, sendTrack, fetchOwnerStats, type TrackPayload } from './analytics-api';
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd kizuna-core && npx vitest run src/client/analytics`
Expected: PASS (analytics-api + use-track-view). Se `@testing-library/react`/`jsdom` não resolverem, conferir `node_modules` da raiz do starter (o vitest do core os resolve de lá).

- [ ] **Step 5: Checkpoint** — não commitar.

---

### Task 6: Registrar resource e RPC no starter + config

**Files:**
- Create: `kizuna-core/src/client/components/screen-engine/resources/analytics.ts`, `src/lib/analytics.ts`
- Modify: `src/lib/server/resources.ts`, `kizuna.config.json`, `kizuna-core/starter/kizuna.config.json`, `kizuna-core/starter/kizuna.plugins.json`
- Test: `kizuna-core/src/client/components/screen-engine/resources/analytics.test.ts`

**Interfaces:**
- Consumes: `ResourceConfig`, `RpcConfig` de `@kizuna/core/types`; `rpcAuthMode` de `kizuna-core/src/server/rpc-auth`.
- Produces: `resourceAnalytics: Record<string, ResourceConfig>` (chave `analytics_events`), `rpcAnalytics: Record<string, RpcConfig>` (chave `fn_analytics_track`), `analyticsConfig`/`trackRule(entityType, event)` em `@/lib/analytics`.

- [ ] **Step 1: Escrever o teste**

Criar `kizuna-core/src/client/components/screen-engine/resources/analytics.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { rpcAuthMode } from '../../../../server/rpc-auth';
import { resourceAnalytics, rpcAnalytics } from './analytics';

describe('analytics resources', () => {
  it('a escrita é RPC pública com sessão opcional', () => {
    expect(rpcAuthMode(rpcAnalytics.fn_analytics_track)).toBe('optional');
  });

  it('a leitura exige login e aceita páginas grandes', () => {
    const cfg = resourceAnalytics.analytics_events;
    expect(cfg.table).toBe('analytics_events');
    expect(cfg.listRequiresAuth).not.toBe(false);
    expect(cfg.maxPageSize).toBe(1000);
    expect(cfg.select).toBe('entity_id,visitor_hash,day,event_type,source');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd kizuna-core && npx vitest run src/client/components/screen-engine/resources/analytics.test.ts`
Expected: FAIL — módulo `./analytics` inexistente.

- [ ] **Step 3: Implementar o config do core**

Criar `kizuna-core/src/client/components/screen-engine/resources/analytics.ts` (molde de `swipe.ts` / `reviews.ts`; conferir o import de tipos usado lá e usar o mesmo):

```ts
import type { ResourceConfig, RpcConfig } from '@kizuna/core/types';

/**
 * Plugin `analytics`. Spread em `postgrestResources` / `postgrestRpcs` do projeto.
 *
 * - `analytics_events`: leitura das linhas do tenant (RLS pelo dono do anúncio). Só GET é usado;
 *   a escrita NÃO passa pelo CRUD genérico (exige login) e sim pela RPC abaixo.
 * - `fn_analytics_track`: escrita pública (visitante anônimo), sessão opcional — o INSERT é
 *   protegido por RLS/CHECK/UNIQUE no banco (plugins/analytics/0001_analytics.sql).
 */
export const resourceAnalytics: Record<string, ResourceConfig> = {
  analytics_events: {
    schema: 'public',
    table: 'analytics_events',
    select: 'entity_id,visitor_hash,day,event_type,source',
    primaryKey: 'id',
    defaultOrder: 'id',
    searchableColumns: [],
    maxPageSize: 1000,
  },
};

export const rpcAnalytics: Record<string, RpcConfig> = {
  fn_analytics_track: { schema: 'public', requiresAuth: false, optionalAuth: true },
};
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd kizuna-core && npx vitest run src/client/components/screen-engine/resources/analytics.test.ts`
Expected: PASS.

- [ ] **Step 5: Ligar no starter**

Em `src/lib/server/resources.ts`: adicionar, junto aos imports de plugin, `import { resourceAnalytics, rpcAnalytics } from '@kizuna/core/client/components/screen-engine/resources/analytics';`; em `postgrestResources` acrescentar `...(resourceAnalytics as Record<string, ResourceConfig>),` após `resourceServices`; em `postgrestRpcs` acrescentar, após `...rpcSwipe,`, o comentário `// analytics plugin — escrita anônima de eventos (views, cliques...). Pública + sessão opcional.` e `...rpcAnalytics,`. Edição pontual (o arquivo pode ter alterações locais do usuário — não reformatar o resto).

Criar `src/lib/analytics.ts`:

```ts
import {
  parseAnalyticsConfig,
  resolveEventRule,
  type AnalyticsEvent,
} from '@kizuna/core/shared/analytics';
import cfg from '@/../kizuna.config.json';

export const analyticsConfig = parseAnalyticsConfig((cfg as { analytics?: unknown }).analytics);

/** Regra do evento para o `<TrackView rule={...}>` (calculada no servidor, passada por prop). */
export const trackRule = (entityType: string, event: AnalyticsEvent) =>
  resolveEventRule(analyticsConfig, entityType, event);
```

Adicionar aos dois `kizuna.config.json` (edição pontual, bloco de primeiro nível):

```json
"analytics": {
  "_comment": "Plugin analytics (métricas do anunciante). events = só os listados ligam. minVisibleMs = tempo contínuo em tela, em milissegundos, antes de contar (piso: view 500, impression 200; teto 60000). minVisibleRatio = fração do elemento visível (0..1). oncePerSession = conta no máximo 1x por sessão do navegador. 0 ms = conta na hora (cliques de ação). entities.<tipo>.events sobrescreve por tipo de entidade. enabled:false desliga; remova o bloco para usar os defaults.",
  "enabled": true,
  "events": {
    "impression": { "minVisibleMs": 500, "minVisibleRatio": 0.6, "oncePerSession": true },
    "view": { "minVisibleMs": 1500, "minVisibleRatio": 0.5, "oncePerSession": true },
    "contact_click": { "minVisibleMs": 0 },
    "favorite": { "minVisibleMs": 0 },
    "share": { "minVisibleMs": 0 }
  },
  "entities": {}
}
```

Rodar `grep -n "reviews" kizuna-core/starter/kizuna.plugins.json`, ver o formato da entrada de `reviews` e acrescentar `analytics` no mesmo formato depois dela (e no `kizuna.plugins.json` da raiz, se existir).

- [ ] **Step 6: Validar**

Run:
```bash
node -e "for (const f of ['kizuna.config.json','kizuna-core/starter/kizuna.config.json']) JSON.parse(require('fs').readFileSync(f,'utf8')); console.log('json ok')"
npx tsc --noEmit -p . 2>&1 | grep -E "analytics|resources\.ts" ; echo done
```
Expected: `json ok`; nenhuma linha de erro antes de `done`.

- [ ] **Step 7: Teste manual do fluxo (dev server rodando, `0001` aplicado, um serviço ativo)**

Run (troque `SERVICE_UID` por um `uid` real de `public.services`):
```bash
curl -s -X POST http://localhost:3000/api/resources/fn_analytics_track -H "content-type: application/json" \
  -d '{"p_entity_type":"service","p_entity_id":"SERVICE_UID","p_event_type":"view","p_visitor_hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","p_source":"search","p_visible_ms":1600}'
docker exec -i postgres_local psql -U myuser -d foco_total_db -c "select event_type, source, visible_ms, day from public.analytics_events order by id desc limit 3;"
```
Expected: 1ª chamada `{"items":[],"payload":true}` e uma linha `view | search | 1600`; repetir a mesma chamada → `payload:false` e nenhuma linha nova; com `p_visible_ms` 100 → erro 400 (CHECK) e nada gravado.

- [ ] **Step 8: Checkpoint** — não commitar.

---

### Task 7: Documentação e verificação final

**Files:**
- Create: `kizuna-core/docs/plugins/analytics.md`
- Modify: `kizuna-core/plugins/README.md` (item `analytics/`), `kizuna-core/docs/plugins/README.md` (linha na tabela de plugins, se houver a tabela)

- [ ] **Step 1: Documento do plugin**

Criar `kizuna-core/docs/plugins/analytics.md`:

````markdown
# Plugin `analytics`

Métricas de negócio por anúncio, first-party, sem cookie e sem dado pessoal. Uma tabela
(`analytics_events`) e uma função (`fn_analytics_track`); sem views, rollup ou trigger.

## Como funciona

1. O cliente (`useTrackView` / `trackEvent`) decide quando um evento conta — tempo mínimo em
   milissegundos, fração visível, aba em foco, uma vez por sessão — e chama
   `POST /api/resources/fn_analytics_track` (RPC pública, sessão opcional).
2. O banco valida por CHECK/RLS/UNIQUE: piso de tempo (`view` 500 ms, `impression` 200 ms), anúncio
   ativo, dono não conta, no máximo 1 linha por visitante/anúncio/evento/dia.
3. O painel lê `GET /api/resources/analytics_events` (RLS = anúncios do tenant) e agrega no
   cliente com `fetchOwnerStats(days)`.

## Configuração (`kizuna.config.json` → `analytics`)

| Campo | Efeito |
|---|---|
| `enabled` | `false` desliga a coleta |
| `events.<evento>.minVisibleMs` | milissegundos contínuos em tela antes de contar; `0` = na hora |
| `events.<evento>.minVisibleRatio` | fração do elemento visível (0..1) |
| `events.<evento>.oncePerSession` | conta no máximo 1x por sessão |
| `entities.<tipo>.events.<evento>` | sobrescreve por tipo de entidade |

Eventos: `impression`, `view`, `contact_click`, `favorite`, `share`. Teto de `minVisibleMs`: 60000.

## Uso no front

```tsx
// Server Component
import { TrackView } from '@kizuna/core/client/analytics';
import { trackRule } from '@/lib/analytics';

<TrackView entityType="service" entityId={service.uid} event="view" rule={trackRule('service', 'view')} source="search">
  {/* conteúdo do anúncio */}
</TrackView>

// Client: clique de ação
import { trackEvent } from '@kizuna/core/client/analytics';
trackEvent({ entityType: 'service', entityId: uid, event: 'contact_click' });
```

## Decisões e limites

- **Uma função só:** `createResource` exige login e a maioria dos visitantes é anônima; por isso a
  escrita é uma RPC pública (`requiresAuth:false`), no molde do `swipe`.
- **Dedupe por dia:** `views` = visitantes-dia por anúncio; clique de contato repetido no mesmo dia
  conta 1. O `visitor_hash` é aleatório, gerado no navegador e trocado por dia UTC.
- **Anti-abuso:** um cliente malicioso pode inventar hashes; o custo é bloqueado só pelo piso de tempo,
  pelo UNIQUE e pela exigência de anúncio ativo. Filtro de bot é best-effort no cliente.
- **Volume:** a agregação lê até 20 páginas de 1000 linhas (ordem `id desc`). Se um anunciante
  passar disso, introduzir rollup (tabela mantida por job/trigger) num plano à parte.
- **Retenção:** o `0001` agenda via `pg_cron`, se existir, `DELETE ... day < CURRENT_DATE - 400`. Sem
  `pg_cron`, agendar essa instrução por fora.
- **Fuso:** `day` usa `CURRENT_DATE` do banco; as janelas do cliente usam UTC. Rodar o banco em UTC.
- **Dependência:** as policies referenciam `public.services` (plugin `services`).

## Novo tipo de entidade

1. Incluir o tipo no CHECK `analytics_events_entity_chk` e replicar as policies de INSERT/SELECT para
   o dono dessa entidade (migration nova).
2. Passar o novo `entityType` ao `TrackView`/`trackEvent`.
````

- [ ] **Step 2: README dos plugins**

Ler `kizuna-core/plugins/README.md`: substituir o item `analytics/` (existente, descreve o desenho antigo com `analytics_daily`/`fn_analytics_owner_report`) por 3–4 linhas fiéis ao desenho novo: tabela `analytics_events` (uma linha por visitante/entidade/evento/dia, CHECK/UNIQUE/RLS), única função `fn_analytics_track` (escrita anônima), leitura via resource, agregação no cliente; retenção por pg_cron inline. Se `kizuna-core/docs/plugins/README.md` tiver tabela de plugins, acrescentar a linha `analytics` no mesmo formato.

- [ ] **Step 3: Verificação final**

Run:
```bash
cd kizuna-core && npx vitest run src/shared/analytics src/client/analytics src/client/components/screen-engine/resources/analytics.test.ts
cd .. && npx tsc --noEmit -p . 2>&1 | grep -E "analytics|resources\.ts" ; echo done
docker exec -i postgres_local psql -U myuser -d foco_total_db < kizuna-core/db/extras/analytics_test_smoke.sql
git status --short | grep -i analytics
```
Expected: testes de analytics passam; nenhuma linha de erro do tsc antes de `done`; smoke `analytics OK`; nenhum arquivo `src/app/api/**` novo no `git status`.

- [ ] **Step 4: Checkpoint final** — listar `git status`, revisar, aguardar o usuário pedir o commit (core + starter).

---

## Fora do escopo (planos seguintes)

- Trocar `getMockMetrics`/`getMockSeries`/`MOCK_ADS` do front (`src/lib/analytics-metrics.ts`, `painel-home.tsx`, `painel-metricas.tsx`) por `fetchOwnerStats`, mostrando "—" quando `value` é `null` e juntando `entityId` com a lista "Meus serviços" para o título.
- Instrumentar as telas: `<TrackView>` no detalhe e nos cards (impressão), `trackEvent` nos botões de WhatsApp/telefone, favorito e compartilhar.
- Fontes das métricas sem dados: conversas (`messaging`), avaliação (`review_stats`), tempo de resposta, créditos.
- Rollup para volume alto e visão de gestor (agregada por plataforma, permissão `analytics.view_all`).

## Self-review

- **Cobertura:** tempo mínimo em ms configurável (T2 + T5 + T6 + CHECK em T1), coleta first-party sem cookie (T4), dedupe/únicos (UNIQUE em T1 + `uniques` em T3), leitura para o anunciante com delta, série, origens e por anúncio (T3/T4), retenção (T1), config no framework/starter (T6), docs (T7). Sem rotas `/api` novas e com uma única função SQL, conforme as restrições. Lacunas listadas em "Fora do escopo".
- **Placeholders:** nenhum; todo passo de código traz o código.
- **Consistência de tipos:** `AnalyticsEvent`, `EventRule`, `AnalyticsRow`, `OwnerStats`, `PeriodDays` definidos em T2/T3 e usados com os mesmos nomes em T4–T6; args `p_*` de `fn_analytics_track` idênticos em T1 (SQL), T4 (cliente) e T6 (curl); select do resource (`entity_id,visitor_hash,day,event_type,source`) casa com `AnalyticsRow`.
