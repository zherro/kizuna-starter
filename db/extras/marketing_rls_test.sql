-- db/extras/marketing_rls_test.sql
-- Prova por papel (sec-rls) das policies do plugin marketing. Rode em BANCO DE TESTE (nunca produção):
--   psql "$DATABASE_URL_TESTE" -v ON_ERROR_STOP=1 -f db/extras/marketing_rls_test.sql
-- Tudo roda numa transação com ROLLBACK no fim; cada bloco falha com EXCEPTION se a regra quebrar.
-- Precisa de: 2 usuários de tenants diferentes (A e B), A com um anúncio publicado (services.status='active').
-- Os claims são os do JWT: user_id / tenant_id / perms / is_root (auth.fun_auth_*).

BEGIN;

CREATE TEMP TABLE _ctx AS
SELECT s.created_by AS ua, s.tenant_id AS ta, s.uid AS svc,
       (SELECT t.owner_uid FROM auth.tenants t WHERE t.uid <> s.tenant_id LIMIT 1) AS ub,
       (SELECT t.uid FROM auth.tenants t WHERE t.uid <> s.tenant_id LIMIT 1) AS tb
FROM public.services s WHERE s.active AND s.status = 'active' LIMIT 1;
GRANT SELECT ON _ctx TO anon, auth_user;

-- helper de teste: assume papel + claims
CREATE OR REPLACE FUNCTION pg_temp.act_as(p_role text, p_user uuid, p_tenant uuid, p_root boolean, p_perms jsonb DEFAULT '{}')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('user_id', p_user, 'tenant_id', p_tenant, 'is_root', p_root, 'perms', p_perms)::text, true);
  EXECUTE format('SET LOCAL ROLE %I', p_role);
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.act_as(text, uuid, uuid, boolean, jsonb) TO PUBLIC;

-- ---------------------------------------------------------------------------------------------
-- 1) Admin lança crédito para A; usuário A não consegue se creditar sozinho
-- ---------------------------------------------------------------------------------------------
SELECT pg_temp.act_as('auth_user', (SELECT ua FROM _ctx), (SELECT ta FROM _ctx), false);
DO $$
BEGIN
  BEGIN
    INSERT INTO public.wallet_ledger (tenant_id, kind, amount_cents) VALUES ((SELECT ta FROM _ctx), 'credit_admin', 100000);
    RAISE EXCEPTION 'FALHA: usuário comum se creditou';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL;
  END;
END $$;
RESET ROLE;

SELECT pg_temp.act_as('auth_user', (SELECT ua FROM _ctx), (SELECT ta FROM _ctx), false, '{"marketing":{"manage":true}}');
INSERT INTO public.wallet_ledger (tenant_id, kind, amount_cents, note) VALUES ((SELECT ta FROM _ctx), 'credit_admin', 10000, 'teste');
DO $$ BEGIN
  IF (SELECT balance_cents FROM public.vw_wallet_balance WHERE tenant_id = (SELECT ta FROM _ctx)) <> 10000 THEN
    RAISE EXCEPTION 'FALHA: saldo deveria ser 10000';
  END IF;
  -- livro-razão: sem UPDATE/DELETE nem para o admin
  BEGIN UPDATE public.wallet_ledger SET amount_cents = 1; RAISE EXCEPTION 'FALHA: UPDATE no ledger';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

-- ---------------------------------------------------------------------------------------------
-- 2) Dono cria boost com saldo; sem saldo é recusado; não impulsiona anúncio alheio
-- ---------------------------------------------------------------------------------------------
SELECT pg_temp.act_as('auth_user', (SELECT ua FROM _ctx), (SELECT ta FROM _ctx), false);
INSERT INTO public.boosts (service_uid, daily_cents, starts_on, ends_on)
VALUES ((SELECT svc FROM _ctx), 1000, CURRENT_DATE + 1, CURRENT_DATE + 5);   -- 5 dias × 1000 = 5000 (cabe nos 10000)
DO $$ BEGIN
  IF (SELECT balance_cents FROM public.vw_wallet_balance WHERE tenant_id = (SELECT ta FROM _ctx)) <> 5000 THEN
    RAISE EXCEPTION 'FALHA: saldo após reserva deveria ser 5000';
  END IF;
  BEGIN  -- sobreposição do mesmo anúncio
    INSERT INTO public.boosts (service_uid, daily_cents, starts_on, ends_on)
    VALUES ((SELECT svc FROM _ctx), 500, CURRENT_DATE + 2, CURRENT_DATE + 3);
    RAISE EXCEPTION 'FALHA: aceitou boost sobreposto';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;
  BEGIN  -- sem saldo (restam 5000; pede 6 × 1000 em outro período, mas outro anúncio nem existe → usa período depois)
    INSERT INTO public.boosts (service_uid, daily_cents, starts_on, ends_on)
    VALUES ((SELECT svc FROM _ctx), 1000, CURRENT_DATE + 10, CURRENT_DATE + 15);
    RAISE EXCEPTION 'FALHA: aceitou boost sem saldo';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;
  BEGIN  -- início no passado
    INSERT INTO public.boosts (service_uid, daily_cents, starts_on, ends_on)
    VALUES ((SELECT svc FROM _ctx), 500, CURRENT_DATE - 1, CURRENT_DATE);
    RAISE EXCEPTION 'FALHA: aceitou início no passado';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;
END $$;

-- parar devolve os dias não usados; não dá para "retomar"; não dá para mudar valores
UPDATE public.boosts SET stopped_on = CURRENT_DATE + 3 WHERE service_uid = (SELECT svc FROM _ctx);  -- usa 2 dos 5 dias
DO $$ BEGIN
  IF (SELECT balance_cents FROM public.vw_wallet_balance WHERE tenant_id = (SELECT ta FROM _ctx)) <> 8000 THEN
    RAISE EXCEPTION 'FALHA: após parar, saldo deveria ser 8000';
  END IF;
  DECLARE n int;
  BEGIN
    UPDATE public.boosts SET stopped_on = NULL;       -- RLS filtra a linha já parada: 0 linhas, sem erro
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 0 THEN RAISE EXCEPTION 'FALHA: retomou'; END IF;
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;
  BEGIN UPDATE public.boosts SET daily_cents = 1; RAISE EXCEPTION 'FALHA: alterou a diária';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

-- ---------------------------------------------------------------------------------------------
-- 3) Outro tenant (B) não vê saldo, boosts nem extrato de A; anon só vê a projeção pública sem valores
-- ---------------------------------------------------------------------------------------------
SELECT pg_temp.act_as('auth_user', (SELECT ub FROM _ctx), (SELECT tb FROM _ctx), false);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.wallet_ledger WHERE tenant_id = (SELECT ta FROM _ctx)) THEN RAISE EXCEPTION 'FALHA: B leu o extrato de A'; END IF;
  IF EXISTS (SELECT 1 FROM public.boosts WHERE tenant_id = (SELECT ta FROM _ctx)) THEN RAISE EXCEPTION 'FALHA: B leu boosts de A'; END IF;
  IF EXISTS (SELECT 1 FROM public.vw_wallet_balance WHERE tenant_id = (SELECT ta FROM _ctx)) THEN RAISE EXCEPTION 'FALHA: B leu o saldo de A'; END IF;
  BEGIN  -- impulsionar anúncio alheio
    INSERT INTO public.boosts (service_uid, daily_cents, starts_on, ends_on)
    VALUES ((SELECT svc FROM _ctx), 500, CURRENT_DATE + 1, CURRENT_DATE + 2);
    RAISE EXCEPTION 'FALHA: B impulsionou anúncio de A';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;
END $$;
RESET ROLE;

SELECT pg_temp.act_as('anon', NULL, NULL, false);
DO $$ BEGIN
  BEGIN PERFORM 1 FROM public.boosts LIMIT 1; RAISE EXCEPTION 'FALHA: anon lê boosts';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM 1 FROM public.wallet_ledger LIMIT 1; RAISE EXCEPTION 'FALHA: anon lê wallet_ledger';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM 1 FROM public.vw_boosts_live LIMIT 1;           -- permitido
  PERFORM 1 FROM public.vw_ad_campaigns_live LIMIT 1;     -- permitido
END $$;
RESET ROLE;

-- ---------------------------------------------------------------------------------------------
-- 4) Banner: dono insere INATIVO; não se auto-aprova; só entra no ar com revisão + campanha vigente
-- ---------------------------------------------------------------------------------------------
SELECT pg_temp.act_as('auth_user', (SELECT ua FROM _ctx), (SELECT ta FROM _ctx), false);
DO $$
DECLARE v_slot text; v_id uuid := gen_random_uuid();
BEGIN
  SELECT slug INTO v_slot FROM public.ad_slots WHERE enabled LIMIT 1;
  IF v_slot IS NULL THEN RAISE NOTICE 'sem ad_slots habilitado — bloco de banner pulado'; RETURN; END IF;

  BEGIN  -- nasce ativo: recusado
    INSERT INTO public.ad_creatives (id, tenant_id, format, kind, image_url, link_url, slots, active)
    VALUES (gen_random_uuid(), (SELECT ta FROM _ctx), 'banner', 'imagem', '/x.png', 'https://x.com', ARRAY[v_slot], true);
    RAISE EXCEPTION 'FALHA: dono criou banner ativo';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;

  INSERT INTO public.ad_creatives (id, tenant_id, format, kind, image_url, link_url, slots, active)
  VALUES (v_id, (SELECT ta FROM _ctx), 'banner', 'imagem', '/x.png', 'https://x.com', ARRAY[v_slot], false);

  DECLARE n int;
  BEGIN
    UPDATE public.ad_creatives SET active = true WHERE id = v_id;   -- só admin atualiza: 0 linhas
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 0 THEN RAISE EXCEPTION 'FALHA: dono ativou o banner'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO public.ad_creative_reviews (creative_id, status) VALUES (v_id, 'approved'); RAISE EXCEPTION 'FALHA: dono se auto-aprovou';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;

  INSERT INTO public.ad_campaigns (creative_id, slot_slug, daily_cents, starts_on, ends_on)
  VALUES (v_id, v_slot, 1000, CURRENT_DATE, CURRENT_DATE + 1);   -- 2 × 1000 = 2000 (restam 8000)
END $$;
RESET ROLE;

-- sem revisão aprovada, o anônimo NÃO vê o criativo
SELECT pg_temp.act_as('anon', NULL, NULL, false);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.ad_creatives WHERE tenant_id = (SELECT ta FROM _ctx)) THEN
    RAISE EXCEPTION 'FALHA: anon vê banner sem aprovação';
  END IF;
END $$;
RESET ROLE;

-- admin aprova e ativa → entra no ar (campanha vigente hoje)
SELECT pg_temp.act_as('auth_user', (SELECT ua FROM _ctx), (SELECT ta FROM _ctx), false, '{"marketing":{"manage":true}}');
DO $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.ad_creatives WHERE tenant_id = (SELECT ta FROM _ctx) LIMIT 1;
  IF v_id IS NULL THEN RETURN; END IF;
  INSERT INTO public.ad_creative_reviews (creative_id, status) VALUES (v_id, 'approved');
  UPDATE public.ad_creatives SET active = true WHERE id = v_id;
END $$;
RESET ROLE;

SELECT pg_temp.act_as('anon', NULL, NULL, false);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.ad_creatives WHERE tenant_id = (SELECT ta FROM _ctx))
     AND NOT EXISTS (SELECT 1 FROM public.vw_ad_campaigns_live) THEN
    RAISE EXCEPTION 'FALHA: banner visível sem campanha viva';
  END IF;
END $$;
RESET ROLE;

-- ---------------------------------------------------------------------------------------------
-- 5) Pagamento: dono cria só pendente, sem external_id
-- ---------------------------------------------------------------------------------------------
SELECT pg_temp.act_as('auth_user', (SELECT ua FROM _ctx), (SELECT ta FROM _ctx), false);
INSERT INTO public.payment_intents (amount_cents) VALUES (5000);
DO $$ BEGIN
  BEGIN INSERT INTO public.payment_intents (amount_cents, status) VALUES (5000, 'paid'); RAISE EXCEPTION 'FALHA: criou pago';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;
  BEGIN UPDATE public.payment_intents SET status = 'paid'; RAISE EXCEPTION 'FALHA: dono marcou pago';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

SELECT 'OK: todas as regras do marketing passaram' AS resultado;
ROLLBACK;
