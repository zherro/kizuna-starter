-- db/extras/marketing_producao.sql
-- Plugin MARKETING (saldo, impulsionamento "Bora Indica", campanhas de banner e pagamentos) — rodar à mão em PRODUÇÃO.
--
-- Pré-requisitos (já existem em produção): plugins services, analytics e ads aplicados.
--   Confira antes:  SELECT name, version FROM auth.plugin_registry WHERE name IN ('services','analytics','ads');
-- É ADITIVO e IDEMPOTENTE (pode rodar de novo sem erro). O que ele faz:
--   * cria wallet_ledger, boosts, ad_campaigns, ad_creative_reviews, payment_intents e as views vw_*;
--   * acrescenta tenant_id/created_by em ad_creatives (criativos do site continuam com tenant_id NULL);
--   * troca as policies de ad_creatives (admin do site segue igual; anunciante só vê o que a policy permite);
--   * registra a permissão marketing.manage (root já tem tudo; não concede a mais ninguém);
--   * NOTIFY pgrst: o PostgREST recarrega o schema sozinho.
-- Como rodar (um arquivo, uma transação; se algo falhar, nada fica pela metade):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction -f db/extras/marketing_producao.sql
-- Depois do SQL, publique o app (código novo) — o app antigo ignora as tabelas novas, então a ordem
-- segura é: 1) este SQL, 2) deploy do app.
-- Opcional no servidor: MARKETING_PAYMENT_PROVIDER (padrão 'manual'), MARKETING_MANUAL_INSTRUCTIONS
-- (texto mostrado no "Adicionar saldo") e POSTGREST_SERVICE_TOKEN (necessário só para webhook de pagamento).

-- plugins/marketing/0001_marketing.sql
-- Plugin: marketing — carteira de saldo, impulsionamento de anúncios (selo BORA INDICA) e campanhas
-- de banner/GIF dos anunciantes. Depende de: services, analytics, ads.
--
-- Decisões (documento do plano):
--   * SEM funções e SEM triggers: só tabelas, views, grants e RLS.
--   * Cobrança DIÁRIA por período, reservada na criação: custo = diária × dias comprometidos.
--     Dias comprometidos = dias do período, menos os que sobram depois de `stopped_on` (data do
--     primeiro dia NÃO servido). Parar devolve ao saldo os dias não usados. Hoje já está pago.
--   * Saldo = créditos − custo comprometido (view). Não há escrita de visitante no saldo, então
--     métrica inflada não vira cobrança.
--   * Quem consome (boost / campanha) só INSERE e só PARA (UPDATE de `stopped_on` de NULL para
--     data); não existe "retomar", senão o dia devolvido poderia ser gasto de novo sem checar saldo.
--   * Aprovação de banner mora em tabela separada (`ad_creative_reviews`), só escrita por quem
--     tem `ads.manage`/`marketing.manage`: o dono não consegue se auto-aprovar.
--   * Valores (centavos, bigint) nunca são públicos: o público lê só as views `vw_*_live`.
-- Idempotente.

-- =========================================================================
-- 1) Permissão
-- =========================================================================
INSERT INTO auth.permissions (resource, action, name)
VALUES ('marketing', 'manage', 'Gerir marketing (saldo, impulsionamentos e banners de todos os anunciantes)')
ON CONFLICT (resource, action) DO NOTHING;

-- =========================================================================
-- 2) Carteira (livro-razão só de inserção)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.wallet_ledger (
  id           bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  tenant_id    uuid NOT NULL REFERENCES auth.tenants(uid) ON DELETE RESTRICT,
  kind         text NOT NULL,
  amount_cents bigint NOT NULL,
  note         text NOT NULL DEFAULT '',
  ref_id       text,
  created_by   uuid REFERENCES auth.users(uid) ON DELETE SET NULL DEFAULT auth.fun_auth_user_id(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wallet_ledger_kind_chk   CHECK (kind IN ('credit_admin', 'credit_payment', 'adjust')),
  CONSTRAINT wallet_ledger_amount_chk CHECK (amount_cents <> 0 AND abs(amount_cents) <= 100000000),
  CONSTRAINT wallet_ledger_sign_chk   CHECK (kind = 'adjust' OR amount_cents > 0),
  CONSTRAINT wallet_ledger_note_chk   CHECK (char_length(note) <= 300)
);
CREATE INDEX IF NOT EXISTS wallet_ledger_tenant ON public.wallet_ledger (tenant_id, created_at DESC);
-- Um pagamento confirmado credita uma única vez (webhook reentregue não duplica).
CREATE UNIQUE INDEX IF NOT EXISTS wallet_ledger_payment_once
  ON public.wallet_ledger (ref_id) WHERE kind = 'credit_payment';

-- =========================================================================
-- 3) Impulsionamentos
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.boosts (
  id          bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  service_uid uuid NOT NULL REFERENCES public.services(uid) ON DELETE CASCADE,
  tenant_id   uuid NOT NULL DEFAULT auth.fun_auth_current_tenant_id() REFERENCES auth.tenants(uid) ON DELETE RESTRICT,
  created_by  uuid NOT NULL DEFAULT auth.fun_auth_user_id() REFERENCES auth.users(uid) ON DELETE RESTRICT,
  daily_cents integer NOT NULL,
  starts_on   date NOT NULL,
  ends_on     date NOT NULL,
  stopped_on  date,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT boosts_daily_chk  CHECK (daily_cents BETWEEN 500 AND 1000000),
  CONSTRAINT boosts_period_chk CHECK (ends_on >= starts_on AND ends_on <= starts_on + 89),
  CONSTRAINT boosts_stop_chk   CHECK (stopped_on IS NULL OR (stopped_on >= starts_on AND stopped_on <= ends_on + 1))
);
CREATE INDEX IF NOT EXISTS boosts_tenant  ON public.boosts (tenant_id, starts_on DESC);
CREATE INDEX IF NOT EXISTS boosts_service ON public.boosts (service_uid);
CREATE INDEX IF NOT EXISTS boosts_live    ON public.boosts (starts_on, ends_on) WHERE stopped_on IS NULL;

-- =========================================================================
-- 4) Banners: criativo (ad_creatives) + revisão + campanha
-- =========================================================================
ALTER TABLE public.ad_creatives ADD COLUMN IF NOT EXISTS tenant_id  uuid REFERENCES auth.tenants(uid) ON DELETE RESTRICT;
ALTER TABLE public.ad_creatives ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(uid) ON DELETE SET NULL;
ALTER TABLE public.ad_creatives ALTER COLUMN created_by SET DEFAULT auth.fun_auth_user_id();
CREATE INDEX IF NOT EXISTS ad_creatives_tenant ON public.ad_creatives (tenant_id) WHERE tenant_id IS NOT NULL;

-- Revisão do criativo de anunciante. Sem linha = na fila. `approved` + `active` (ligado pelo admin)
-- é o que publica. Criativos do próprio site (tenant_id NULL) não passam por aqui.
CREATE TABLE IF NOT EXISTS public.ad_creative_reviews (
  creative_id uuid PRIMARY KEY REFERENCES public.ad_creatives(id) ON DELETE CASCADE,
  status      text NOT NULL,
  reason      text NOT NULL DEFAULT '',
  reviewed_by uuid REFERENCES auth.users(uid) ON DELETE SET NULL DEFAULT auth.fun_auth_user_id(),
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ad_creative_reviews_status_chk CHECK (status IN ('approved', 'rejected')),
  CONSTRAINT ad_creative_reviews_reason_chk CHECK (char_length(reason) <= 300)
);

CREATE TABLE IF NOT EXISTS public.ad_campaigns (
  id          bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  creative_id uuid NOT NULL REFERENCES public.ad_creatives(id) ON DELETE CASCADE,
  slot_slug   text NOT NULL REFERENCES public.ad_slots(slug) ON DELETE RESTRICT,
  tenant_id   uuid NOT NULL DEFAULT auth.fun_auth_current_tenant_id() REFERENCES auth.tenants(uid) ON DELETE RESTRICT,
  created_by  uuid NOT NULL DEFAULT auth.fun_auth_user_id() REFERENCES auth.users(uid) ON DELETE RESTRICT,
  daily_cents integer NOT NULL,
  starts_on   date NOT NULL,
  ends_on     date NOT NULL,
  stopped_on  date,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ad_campaigns_daily_chk  CHECK (daily_cents BETWEEN 500 AND 1000000),
  CONSTRAINT ad_campaigns_period_chk CHECK (ends_on >= starts_on AND ends_on <= starts_on + 89),
  CONSTRAINT ad_campaigns_stop_chk   CHECK (stopped_on IS NULL OR (stopped_on >= starts_on AND stopped_on <= ends_on + 1))
);
CREATE INDEX IF NOT EXISTS ad_campaigns_tenant   ON public.ad_campaigns (tenant_id, starts_on DESC);
CREATE INDEX IF NOT EXISTS ad_campaigns_creative ON public.ad_campaigns (creative_id);
CREATE INDEX IF NOT EXISTS ad_campaigns_live     ON public.ad_campaigns (starts_on, ends_on) WHERE stopped_on IS NULL;

-- =========================================================================
-- 5) Pagamentos (provedor ainda não escolhido: a tabela é agnóstica)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.payment_intents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL DEFAULT auth.fun_auth_current_tenant_id() REFERENCES auth.tenants(uid) ON DELETE RESTRICT,
  created_by   uuid NOT NULL DEFAULT auth.fun_auth_user_id() REFERENCES auth.users(uid) ON DELETE RESTRICT,
  amount_cents bigint NOT NULL,
  provider     text NOT NULL DEFAULT 'manual',
  external_id  text,
  status       text NOT NULL DEFAULT 'pending',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_intents_amount_chk   CHECK (amount_cents BETWEEN 1000 AND 100000000),
  CONSTRAINT payment_intents_status_chk   CHECK (status IN ('pending', 'paid', 'failed', 'expired')),
  CONSTRAINT payment_intents_provider_chk CHECK (provider ~ '^[a-z0-9_-]{1,30}$')
);
CREATE INDEX IF NOT EXISTS payment_intents_tenant ON public.payment_intents (tenant_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS payment_intents_external ON public.payment_intents (provider, external_id) WHERE external_id IS NOT NULL;

-- =========================================================================
-- 6) Views
-- =========================================================================
-- Saldo por conta = créditos − custo comprometido. `security_invoker`: cada um vê o seu (RLS das
-- tabelas base); quem tem marketing.manage vê todos.
CREATE OR REPLACE VIEW public.vw_wallet_balance WITH (security_invoker = true) AS
SELECT tenant_id,
       SUM(amount_cents)::bigint AS balance_cents,
       SUM(amount_cents) FILTER (WHERE amount_cents > 0)::bigint AS credited_cents,
       -SUM(amount_cents) FILTER (WHERE amount_cents < 0)::bigint AS committed_cents
FROM (
  SELECT tenant_id, amount_cents FROM public.wallet_ledger
  UNION ALL
  SELECT tenant_id,
         -(daily_cents::bigint
           * GREATEST(0, LEAST(ends_on + 1, COALESCE(stopped_on, ends_on + 1)) - starts_on))
    FROM public.boosts
  UNION ALL
  SELECT tenant_id,
         -(daily_cents::bigint
           * GREATEST(0, LEAST(ends_on + 1, COALESCE(stopped_on, ends_on + 1)) - starts_on))
    FROM public.ad_campaigns
) t
GROUP BY tenant_id;

-- Projeções PÚBLICAS (sem valores). Sem `security_invoker` de propósito: rodam como dono, e o
-- filtro da própria view é a regra. Sem a view, o anônimo teria de ler as tabelas com a diária.
-- Impulsionamento no ar: período corrente, não parado, anúncio publicado.
CREATE OR REPLACE VIEW public.vw_boosts_live AS
SELECT b.service_uid
FROM public.boosts b
JOIN public.services s ON s.uid = b.service_uid AND s.active AND s.status = 'active'
WHERE b.stopped_on IS NULL
  AND CURRENT_DATE BETWEEN b.starts_on AND b.ends_on
GROUP BY b.service_uid;

-- Campanha de banner no ar: criativo APROVADO + período corrente + não parada. A aprovação entra
-- aqui (e não na policy de ad_creatives) porque o anônimo não tem acesso a ad_creative_reviews.
CREATE OR REPLACE VIEW public.vw_ad_campaigns_live AS
SELECT DISTINCT c.creative_id, c.slot_slug
FROM public.ad_campaigns c
JOIN public.ad_creative_reviews r ON r.creative_id = c.creative_id AND r.status = 'approved'
WHERE c.stopped_on IS NULL
  AND CURRENT_DATE BETWEEN c.starts_on AND c.ends_on;

-- Criativos do anunciante logado + situação (na fila / aprovado / reprovado, motivo). Roda como
-- dono; o filtro por conta é a própria view. Os claims do JWT vêm do contexto da requisição.
CREATE OR REPLACE VIEW public.vw_my_ad_creatives AS
SELECT c.id, c.tenant_id, c.format, c.kind, c.image_url, c.alt, c.link_url, c.label, c.slots,
       c.active, c.created_at,
       COALESCE(r.status, 'pending') AS review_status,
       COALESCE(r.reason, '') AS review_reason
FROM public.ad_creatives c
LEFT JOIN public.ad_creative_reviews r ON r.creative_id = c.id
WHERE c.tenant_id IS NOT NULL
  AND c.tenant_id = auth.fun_auth_current_tenant_id();

-- Métricas por dia dos impulsionamentos (do dono: a RLS de analytics_events já restringe).
-- `impressions` = anúncio apareceu na tela; `views` = abriu o detalhe; mais interações.
CREATE OR REPLACE VIEW public.vw_boost_metrics_daily WITH (security_invoker = true) AS
SELECT b.id AS boost_id, b.tenant_id, b.service_uid, e.day,
       COUNT(*) FILTER (WHERE e.event_type = 'impression') AS impressions,
       COUNT(*) FILTER (WHERE e.event_type = 'view') AS views,
       COUNT(*) FILTER (WHERE e.event_type = 'contact_click') AS contact_clicks,
       COUNT(*) FILTER (WHERE e.event_type IN ('favorite', 'share')) AS interactions
FROM public.boosts b
JOIN public.analytics_events e
  ON e.entity_id = b.service_uid
 AND e.day >= b.starts_on
 AND e.day <= LEAST(b.ends_on, COALESCE(b.stopped_on - 1, b.ends_on))
GROUP BY b.id, b.tenant_id, b.service_uid, e.day;

-- Entrega por dia dos banners (impressões e cliques de ad_stats_daily).
CREATE OR REPLACE VIEW public.vw_ad_delivery_daily WITH (security_invoker = true) AS
SELECT c.id AS campaign_id, c.tenant_id, c.creative_id, c.slot_slug, s.day,
       SUM(s.impressions)::bigint AS impressions, SUM(s.clicks)::bigint AS clicks
FROM public.ad_campaigns c
JOIN public.ad_stats_daily s
  ON s.creative_id = c.creative_id
 AND s.slot_slug = c.slot_slug
 AND s.day >= c.starts_on
 AND s.day <= LEAST(c.ends_on, COALESCE(c.stopped_on - 1, c.ends_on))
GROUP BY c.id, c.tenant_id, c.creative_id, c.slot_slug, s.day;

-- =========================================================================
-- 7) Grants
-- =========================================================================
ALTER TABLE public.wallet_ledger        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boosts               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_campaigns         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_creative_reviews  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_intents      ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.wallet_ledger, public.boosts, public.ad_campaigns,
              public.ad_creative_reviews, public.payment_intents FROM anon, auth_user;

GRANT SELECT, INSERT ON public.wallet_ledger TO auth_user;                 -- livro-razão: sem UPDATE/DELETE
GRANT SELECT, INSERT ON public.boosts, public.ad_campaigns TO auth_user;
GRANT UPDATE (stopped_on) ON public.boosts, public.ad_campaigns TO auth_user;  -- só parar
GRANT SELECT, INSERT, UPDATE ON public.ad_creative_reviews TO auth_user;
GRANT SELECT, INSERT ON public.payment_intents TO auth_user;               -- criar pendente; "pago" só o servidor
GRANT SELECT ON public.vw_wallet_balance, public.vw_boost_metrics_daily, public.vw_ad_delivery_daily TO auth_user;
GRANT SELECT ON public.vw_boosts_live, public.vw_ad_campaigns_live TO anon, auth_user;
GRANT SELECT ON public.vw_my_ad_creatives TO auth_user;

-- =========================================================================
-- 8) Políticas
-- =========================================================================
-- wallet_ledger: dono lê o próprio extrato; só marketing.manage lança crédito/ajuste.
DROP POLICY IF EXISTS wallet_ledger_select ON public.wallet_ledger;
CREATE POLICY wallet_ledger_select ON public.wallet_ledger FOR SELECT TO auth_user
USING (tenant_id = auth.fun_auth_current_tenant_id() OR auth.fun_auth_has_perm('marketing', 'manage'));
DROP POLICY IF EXISTS wallet_ledger_insert ON public.wallet_ledger;
CREATE POLICY wallet_ledger_insert ON public.wallet_ledger FOR INSERT TO auth_user
WITH CHECK (kind IN ('credit_admin', 'adjust') AND auth.fun_auth_has_perm('marketing', 'manage'));

-- boosts
DROP POLICY IF EXISTS boosts_select ON public.boosts;
CREATE POLICY boosts_select ON public.boosts FOR SELECT TO auth_user
USING (tenant_id = auth.fun_auth_current_tenant_id() OR auth.fun_auth_has_perm('marketing', 'manage'));

DROP POLICY IF EXISTS boosts_insert ON public.boosts;
CREATE POLICY boosts_insert ON public.boosts FOR INSERT TO auth_user
WITH CHECK (
  tenant_id = auth.fun_auth_current_tenant_id()
  AND created_by = auth.fun_auth_user_id()
  AND stopped_on IS NULL
  AND starts_on >= CURRENT_DATE
  -- o anúncio é do próprio dono e está publicado
  AND EXISTS (
    SELECT 1 FROM public.services s
     WHERE s.uid = boosts.service_uid
       AND s.created_by = auth.fun_auth_user_id()
       AND s.active AND s.status = 'active'
  )
  -- sem sobrepor outro impulsionamento ainda valendo do mesmo anúncio
  AND NOT EXISTS (
    SELECT 1 FROM public.boosts o
     WHERE o.service_uid = boosts.service_uid
       AND o.stopped_on IS NULL
       AND o.ends_on >= boosts.starts_on
       AND o.starts_on <= boosts.ends_on
  )
  -- saldo cobre o período inteiro (reserva)
  AND COALESCE((SELECT w.balance_cents FROM public.vw_wallet_balance w
                 WHERE w.tenant_id = boosts.tenant_id), 0)
      >= boosts.daily_cents::bigint * (boosts.ends_on - boosts.starts_on + 1)
);

-- parar: só linha ainda não parada, e só para uma data de parada válida (hoje já está pago).
DROP POLICY IF EXISTS boosts_stop ON public.boosts;
CREATE POLICY boosts_stop ON public.boosts FOR UPDATE TO auth_user
USING (stopped_on IS NULL AND (tenant_id = auth.fun_auth_current_tenant_id() OR auth.fun_auth_has_perm('marketing', 'manage')))
WITH CHECK (stopped_on IS NOT NULL AND stopped_on >= GREATEST(starts_on, CURRENT_DATE + 1) AND stopped_on <= ends_on + 1);

-- ad_creatives: o dono do banner insere (nunca ativo) e vê os seus; ninguém além do admin edita.
DROP POLICY IF EXISTS ad_creatives_select ON public.ad_creatives;
CREATE POLICY ad_creatives_select ON public.ad_creatives FOR SELECT TO anon, auth_user
USING (
  (
    active
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at IS NULL OR ends_at >= now())
    AND (tenant_id IS NULL OR id IN (SELECT creative_id FROM public.vw_ad_campaigns_live))
  )
  OR auth.fun_auth_has_perm('ads', 'manage')
  OR auth.fun_auth_has_perm('marketing', 'manage')
  -- O dono vê o criativo só enquanto inativo (aguardando revisão): é o que deixa o INSERT devolver a
  -- linha. Depois de aprovado e fora do ar ele NÃO aparece aqui — senão o pool de anúncios do próprio
  -- anunciante exibiria (e contaria) banner parado. O painel lê pela view `vw_my_ad_creatives`.
  OR (tenant_id IS NOT NULL AND NOT active AND tenant_id = auth.fun_auth_current_tenant_id())
);
DROP POLICY IF EXISTS ad_creatives_owner_insert ON public.ad_creatives;
CREATE POLICY ad_creatives_owner_insert ON public.ad_creatives FOR INSERT TO auth_user
WITH CHECK (
  tenant_id = auth.fun_auth_current_tenant_id()
  AND created_by = auth.fun_auth_user_id()
  AND active = false
  AND weight = 1
  AND starts_at IS NULL AND ends_at IS NULL
  AND cardinality(cities) = 0
);
DROP POLICY IF EXISTS ad_creatives_insert ON public.ad_creatives;
CREATE POLICY ad_creatives_insert ON public.ad_creatives FOR INSERT TO auth_user
WITH CHECK (auth.fun_auth_has_perm('ads', 'manage') OR auth.fun_auth_has_perm('marketing', 'manage'));
DROP POLICY IF EXISTS ad_creatives_update ON public.ad_creatives;
CREATE POLICY ad_creatives_update ON public.ad_creatives FOR UPDATE TO auth_user
USING (auth.fun_auth_has_perm('ads', 'manage') OR auth.fun_auth_has_perm('marketing', 'manage'))
WITH CHECK (auth.fun_auth_has_perm('ads', 'manage') OR auth.fun_auth_has_perm('marketing', 'manage'));

-- ad_creative_reviews: dono lê a revisão do seu criativo (motivo de reprovação); admin escreve.
DROP POLICY IF EXISTS ad_creative_reviews_select ON public.ad_creative_reviews;
CREATE POLICY ad_creative_reviews_select ON public.ad_creative_reviews FOR SELECT TO auth_user
USING (
  auth.fun_auth_has_perm('marketing', 'manage') OR auth.fun_auth_has_perm('ads', 'manage')
  OR EXISTS (SELECT 1 FROM public.ad_creatives c
              WHERE c.id = ad_creative_reviews.creative_id AND c.tenant_id = auth.fun_auth_current_tenant_id())
);
DROP POLICY IF EXISTS ad_creative_reviews_insert ON public.ad_creative_reviews;
CREATE POLICY ad_creative_reviews_insert ON public.ad_creative_reviews FOR INSERT TO auth_user
WITH CHECK (auth.fun_auth_has_perm('marketing', 'manage') OR auth.fun_auth_has_perm('ads', 'manage'));
DROP POLICY IF EXISTS ad_creative_reviews_update ON public.ad_creative_reviews;
CREATE POLICY ad_creative_reviews_update ON public.ad_creative_reviews FOR UPDATE TO auth_user
USING (auth.fun_auth_has_perm('marketing', 'manage') OR auth.fun_auth_has_perm('ads', 'manage'))
WITH CHECK (auth.fun_auth_has_perm('marketing', 'manage') OR auth.fun_auth_has_perm('ads', 'manage'));

-- ad_campaigns (mesma lógica dos boosts)
DROP POLICY IF EXISTS ad_campaigns_select ON public.ad_campaigns;
CREATE POLICY ad_campaigns_select ON public.ad_campaigns FOR SELECT TO auth_user
USING (tenant_id = auth.fun_auth_current_tenant_id() OR auth.fun_auth_has_perm('marketing', 'manage'));

DROP POLICY IF EXISTS ad_campaigns_insert ON public.ad_campaigns;
CREATE POLICY ad_campaigns_insert ON public.ad_campaigns FOR INSERT TO auth_user
WITH CHECK (
  tenant_id = auth.fun_auth_current_tenant_id()
  AND created_by = auth.fun_auth_user_id()
  AND stopped_on IS NULL
  AND starts_on >= CURRENT_DATE
  AND EXISTS (SELECT 1 FROM public.ad_creatives c
               WHERE c.id = ad_campaigns.creative_id AND c.tenant_id = ad_campaigns.tenant_id
                 AND ad_campaigns.slot_slug = ANY (c.slots))
  AND EXISTS (SELECT 1 FROM public.ad_slots sl WHERE sl.slug = ad_campaigns.slot_slug AND sl.enabled)
  AND COALESCE((SELECT w.balance_cents FROM public.vw_wallet_balance w
                 WHERE w.tenant_id = ad_campaigns.tenant_id), 0)
      >= ad_campaigns.daily_cents::bigint * (ad_campaigns.ends_on - ad_campaigns.starts_on + 1)
);
DROP POLICY IF EXISTS ad_campaigns_stop ON public.ad_campaigns;
CREATE POLICY ad_campaigns_stop ON public.ad_campaigns FOR UPDATE TO auth_user
USING (stopped_on IS NULL AND (tenant_id = auth.fun_auth_current_tenant_id() OR auth.fun_auth_has_perm('marketing', 'manage')))
WITH CHECK (stopped_on IS NOT NULL AND stopped_on >= GREATEST(starts_on, CURRENT_DATE + 1) AND stopped_on <= ends_on + 1);

-- ad_stats_daily: o anunciante lê a entrega dos próprios banners (a policy do plugin ads só abre
-- para `ads.manage`, e vw_ad_delivery_daily respeita a RLS de quem consulta). Passa pela view do
-- dono porque o criativo ativo e fora do ar não aparece mais em ad_creatives para ele.
DROP POLICY IF EXISTS ad_stats_owner ON public.ad_stats_daily;
CREATE POLICY ad_stats_owner ON public.ad_stats_daily FOR SELECT TO auth_user
USING (creative_id IN (SELECT id FROM public.vw_my_ad_creatives));

-- payment_intents: dono cria pendente e acompanha; "pago" só o servidor (service_role, abaixo).
DROP POLICY IF EXISTS payment_intents_select ON public.payment_intents;
CREATE POLICY payment_intents_select ON public.payment_intents FOR SELECT TO auth_user
USING (tenant_id = auth.fun_auth_current_tenant_id() OR auth.fun_auth_has_perm('marketing', 'manage'));
DROP POLICY IF EXISTS payment_intents_insert ON public.payment_intents;
CREATE POLICY payment_intents_insert ON public.payment_intents FOR INSERT TO auth_user
WITH CHECK (
  tenant_id = auth.fun_auth_current_tenant_id()
  AND created_by = auth.fun_auth_user_id()
  AND status = 'pending'
  AND external_id IS NULL
);

-- Servidor (webhook do provedor): confirma pagamento e lança o crédito. Sem o papel, só avisa.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT, UPDATE ON public.payment_intents TO service_role;
    GRANT SELECT, INSERT ON public.wallet_ledger TO service_role;
    DROP POLICY IF EXISTS payment_intents_server ON public.payment_intents;
    CREATE POLICY payment_intents_server ON public.payment_intents FOR ALL TO service_role USING (true) WITH CHECK (true);
    DROP POLICY IF EXISTS wallet_ledger_server ON public.wallet_ledger;
    CREATE POLICY wallet_ledger_server ON public.wallet_ledger FOR ALL TO service_role
      USING (true) WITH CHECK (kind = 'credit_payment');
  ELSE
    RAISE NOTICE 'papel service_role ausente (sql/0117) — o webhook de pagamento não poderá creditar';
  END IF;
END $$;

INSERT INTO auth.plugin_registry (name, version)
VALUES ('marketing', '1.0.0')
ON CONFLICT (name) DO UPDATE SET version = EXCLUDED.version;

NOTIFY pgrst, 'reload schema';
