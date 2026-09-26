-- Migrations pendentes (atualizado em 2026-09-26) — idempotentes, seguras para rodar mais de uma vez.
-- Ordem (assume services 0001, search 0001-anterior e swipe 0001 ja aplicados no banco):
--   1. core    sql/0112_password_reset.sql            (esqueci minha senha)
--   2. plugin  services/0002_services_category_stats_view.sql
--   3. plugin  search/0001_search.sql
--   4. plugin  services/0003_service_addresses.sql    (enderecos N por servico)
--   5. plugin  services/0004_services_expires_at.sql  (validade do anuncio)
--   6. plugin  search/0002_search_addresses.sql       (recria fn_search_services com enderecos)
--   7. plugin  swipe/0002_swipe_addresses.sql         (recria fn_swipe_deck / fn_swipe_liked)
--   8. seed    kizuna-core/db/extras/forms_seed_cinema.sql (form 'cinema' + categories.form_key)
-- Rodar:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/extras/pendentes_2026-09-24.sql
-- Tudo numa transação: se algo falhar, nada é aplicado.

BEGIN;


-- =====================================================================
-- kizuna-core/sql/0112_password_reset.sql
-- =====================================================================

-- 0112_password_reset.sql
-- Recuperação de senha ("esqueci minha senha") por link enviado por e-mail.
--
-- Fluxo:
--   1. POST /api/auth/forgot-password → o servidor gera um token aleatório, grava só o SHA-256
--      dele via auth.fun_auth__password_reset_request e envia o token puro por e-mail.
--   2. POST /api/auth/reset-password  → o servidor calcula o SHA-256 do token recebido e chama
--      auth.fun_auth__password_reset_confirm, que troca a senha e queima o token.
--
-- Segurança:
--   * O banco guarda só o hash do token — vazar a tabela não permite resetar ninguém.
--   * As duas funções exigem o claim `purpose = "password_reset"` no JWT da requisição. Esse JWT é
--     assinado pelo servidor Next com PGRST_JWT_SECRET (só ele conhece o segredo), então um
--     cliente anônimo chamando o PostgREST direto não consegue criar token para a conta de outra
--     pessoa (o que permitiria sequestrar a conta escolhendo o próprio token).
--   * Token de uso único, com expiração; pedir um novo invalida os anteriores; trocar a senha
--     invalida todos os pendentes do usuário.
--   * Conta inativa (is_active = false) nunca recebe token.
--
-- Aditivo + idempotente.

CREATE TABLE IF NOT EXISTS auth.password_reset_tokens (
  id bigserial PRIMARY KEY,
  user_uid uuid NOT NULL REFERENCES auth.users(uid) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx
  ON auth.password_reset_tokens (user_uid);

-- Sem GRANT para anon/auth_user: a tabela só é acessada pelas funções SECURITY DEFINER abaixo.
ALTER TABLE auth.password_reset_tokens ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION auth.fun_auth__password_reset_assert_purpose()
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = auth, public
AS $$
BEGIN
  IF COALESCE(
       NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'purpose',
       ''
     ) <> 'password_reset' THEN
    RAISE EXCEPTION 'password_reset_forbidden' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION auth.fun_auth__password_reset_assert_purpose() FROM PUBLIC;

/*
 * Registra um token de reset para o login informado.
 * Retorna true quando existe conta ativa com esse login (o servidor só envia e-mail nesse caso),
 * false caso contrário. O servidor responde a mesma mensagem nos dois casos (sem enumeração).
 */
CREATE OR REPLACE FUNCTION auth.fun_auth__password_reset_request(
  p_login text,
  p_token_hash text,
  p_ttl_minutes integer DEFAULT 60
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  v_uid uuid;
BEGIN
  PERFORM auth.fun_auth__password_reset_assert_purpose();

  IF p_token_hash IS NULL OR length(p_token_hash) < 32 THEN
    RAISE EXCEPTION 'invalid_token_hash' USING ERRCODE = '22023';
  END IF;

  SELECT u.uid
    INTO v_uid
  FROM auth.users u
  WHERE lower(u.login) = lower(trim(p_login))
    AND COALESCE(u.is_active, false)
    AND u.deleted_at IS NULL
  LIMIT 1;

  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  -- Um pedido novo invalida os anteriores ainda pendentes.
  UPDATE auth.password_reset_tokens
     SET used_at = now()
   WHERE user_uid = v_uid
     AND used_at IS NULL;

  INSERT INTO auth.password_reset_tokens (user_uid, token_hash, expires_at)
  VALUES (
    v_uid,
    p_token_hash,
    now() + make_interval(mins => GREATEST(5, LEAST(COALESCE(p_ttl_minutes, 60), 1440)))
  );

  RETURN true;
END;
$$;

/*
 * Troca a senha usando um token válido (não usado, não expirado, conta ativa).
 * Retorna true em caso de sucesso, false se o token for inválido/expirado.
 */
CREATE OR REPLACE FUNCTION auth.fun_auth__password_reset_confirm(
  p_token_hash text,
  p_password text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  v_token_id bigint;
  v_uid uuid;
BEGIN
  PERFORM auth.fun_auth__password_reset_assert_purpose();

  IF p_password IS NULL OR length(p_password) < 6 THEN
    RAISE EXCEPTION 'password_too_short' USING ERRCODE = '22023';
  END IF;

  SELECT t.id, t.user_uid
    INTO v_token_id, v_uid
  FROM auth.password_reset_tokens t
  JOIN auth.users u ON u.uid = t.user_uid
  WHERE t.token_hash = p_token_hash
    AND t.used_at IS NULL
    AND t.expires_at > now()
    AND COALESCE(u.is_active, false)
    AND u.deleted_at IS NULL
  FOR UPDATE OF t;

  IF v_token_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE auth.users
     SET password = auth.crypt(p_password, auth.gen_salt('bf', 10))
   WHERE uid = v_uid;

  -- Queima este token e qualquer outro pendente do mesmo usuário.
  UPDATE auth.password_reset_tokens
     SET used_at = now()
   WHERE user_uid = v_uid
     AND used_at IS NULL;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION auth.fun_auth__password_reset_request(text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth.fun_auth__password_reset_confirm(text, text) FROM PUBLIC;
-- anon pode EXECUTAR, mas a função recusa sem o claim `purpose` (só o servidor assina esse JWT).
GRANT EXECUTE ON FUNCTION auth.fun_auth__password_reset_request(text, text, integer) TO anon;
GRANT EXECUTE ON FUNCTION auth.fun_auth__password_reset_confirm(text, text) TO anon;

NOTIFY pgrst, 'reload schema';


-- =====================================================================
-- kizuna-core/plugins/services/0002_services_category_stats_view.sql
-- =====================================================================

-- plugins/services/0002_services_category_stats_view.sql
-- Read model: quantos anúncios PUBLICADOS cada categoria tem. Uma linha por categoria ativa com
-- ao menos um anúncio publicado (`active AND status = 'active'`) — categoria sem anúncio não
-- aparece. Usada pelo <CategoryCarousel onlyWithListings> (home: `home.categoriesOnlyWithListings`
-- no kizuna.config.json) para esconder categorias vazias.
--
-- Mora aqui, e não no plugin taxonomy, porque a taxonomy é pura e não conhece `services`
-- (ver o cabeçalho de plugins/taxonomy/0002_taxonomy_stats_view.sql).
--
-- Idempotente: CREATE OR REPLACE VIEW. `security_invoker = true` — valem as RLS de `services` e
-- `categories` de quem consulta; o filtro explícito de status garante que um usuário logado não
-- conte os próprios anúncios pendentes (que a policy services_owner_read deixaria ver).

CREATE OR REPLACE VIEW public.vw_category_service_stats
WITH (security_invoker = true) AS
SELECT
  c.id                  AS category_id,
  c.name                AS category_name,
  count(s.id)::int      AS services_count
FROM public.categories c
JOIN public.services s
  ON s.category_id = c.id
 AND s.active = true
 AND s.status = 'active'
WHERE c.active = true
GROUP BY c.id, c.name;

GRANT SELECT ON public.vw_category_service_stats TO anon, auth_user;

INSERT INTO auth.plugin_registry (name, version)
VALUES ('services', '1.1.0')
ON CONFLICT (name) DO UPDATE SET version = EXCLUDED.version;

NOTIFY pgrst, 'reload schema';


-- =====================================================================
-- kizuna-core/plugins/search/0001_search.sql
-- =====================================================================

-- plugins/search/0001_search.sql
-- Optional. Busca pública de serviços: a RPC `fn_search_services` (texto + filtros), usada pela
-- página `/busca` e pelo chat com IA. Sem tabelas próprias — só lê o que outros plugins criam.
--
-- Depende de (aplique DEPOIS): `services`, `taxonomy` (categories_group, categories_group_link,
-- categories_sub), `user_data` (state / city_ibge do prestador) e `reviews` (review_stats, a nota
-- média no ranking). Coloque `search` depois deles em `kizuna.plugins.json`.
--
-- Origem: `fn_search_ads` do foco-total, generalizada. O que ela faz:
--  * fonte única: `public.services` ativos (`active = true AND status = 'active'`);
--  * `p_group_category_slug`: filtra pelo grupo (slug) — enxerga o grupo carimbado no serviço E os
--    vínculos secundários (`categories_group_link`), casando pela CATEGORIA do serviço;
--  * `p_category_id` / `p_subcategories` (jsonb de ids): categoria e especialidades;
--  * `p_state` / `p_city_ibge`: localização do PRESTADOR (`user_data` do tenant dono do serviço);
--    `p_city_id` só entra como critério leve de ordenação (prestador com cidade preenchida antes);
--  * `p_query`: texto livre sem acento (tsvector 'portuguese' + ILIKE no título);
--  * ordenação: relevância do texto → nota média → cidade preenchida → aleatório (`p_seed` mantém a
--    ordem estável entre páginas da mesma busca).
-- SECURITY DEFINER com `search_path` fixo: a busca roda sem sessão (`anon`) e `services` não é
-- legível por ele; a função só devolve a lista fixa de colunas públicas abaixo (nada de `extras`,
-- `tenant_id` etc.). Rating/reviews: agregado O(1) de `review_stats`, sem comentários.

CREATE EXTENSION IF NOT EXISTS unaccent;

DROP FUNCTION IF EXISTS public.fn_search_services(character varying, integer, character varying, bigint, jsonb, text, double precision, integer, integer, text);

CREATE OR REPLACE FUNCTION public.fn_search_services(
  p_state character varying,
  p_city_id integer,
  p_group_category_slug character varying,
  p_category_id bigint DEFAULT NULL::bigint,
  p_subcategories jsonb DEFAULT NULL::jsonb,
  p_query text DEFAULT NULL::text,
  p_seed double precision DEFAULT NULL::double precision,
  p_page integer DEFAULT 0,
  p_page_size integer DEFAULT 20,
  p_city_ibge text DEFAULT NULL::text
)
RETURNS TABLE(
  uid uuid,
  title character varying,
  price numeric,
  price_type character varying,
  category character varying,
  subcategory character varying,
  sponsored boolean,
  cover_file_id character varying,
  provider_name character varying,
  provider_avatar character varying,
  rating numeric,
  reviews integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_query tsquery;
  v_group_id bigint;
BEGIN
  PERFORM setseed(COALESCE(p_seed, random()));

  IF p_query IS NOT NULL AND btrim(p_query) <> '' THEN
    v_query := plainto_tsquery('portuguese', unaccent(p_query));
  END IF;

  IF p_group_category_slug IS NOT NULL AND btrim(p_group_category_slug) <> '' THEN
    SELECT cg.id INTO v_group_id
      FROM public.categories_group cg
     WHERE cg.slug = p_group_category_slug
       AND cg.active = true;

    -- Slug desconhecido ou inativo: nada a devolver.
    IF v_group_id IS NULL THEN
      RETURN;
    END IF;
  END IF;

  RETURN QUERY
  WITH services_filtered AS MATERIALIZED (
    SELECT
      s.uid,
      s.title::character varying           AS title,
      s.starting_price::numeric            AS price,
      s.price_unit::character varying      AS price_type,
      c.name::character varying            AS category,
      sub.name::character varying          AS subcategory,
      COALESCE(s.sponsored, false)         AS sponsored,
      COALESCE(
        NULLIF(s.extras->>'coverFileId', ''),
        s.extras->'images'->>0
      )::character varying                 AS cover_file_id,
      COALESCE(prov.display_name, prov.full_name)::character varying AS provider_name,
      prov.avatar_url::character varying   AS provider_avatar,
      prov.prov_city                       AS provider_city,
      rs.average_rating::numeric           AS rating,
      COALESCE(rs.total_reviews, 0)::integer AS reviews,
      CASE
        WHEN v_query IS NOT NULL
        THEN ts_rank(
          to_tsvector('portuguese', unaccent(s.title || ' ' || COALESCE(s.description, ''))),
          v_query
        )
        ELSE 0::real
      END AS text_rank
    FROM public.services s
    LEFT JOIN public.categories c ON c.id = s.category_id
    LEFT JOIN LATERAL (
      SELECT cs.name
      FROM public.service_categories_sub scs
      JOIN public.categories_sub cs ON cs.id = scs.category_sub_id
      WHERE scs.service_id = s.id
        AND scs.active = true
        AND cs.active = true
      ORDER BY scs.id
      LIMIT 1
    ) sub ON true
    LEFT JOIN LATERAL (
      SELECT ud.full_name, ud.display_name, ud.avatar_url,
             ud.state AS prov_state, ud.city AS prov_city, ud.city_ibge AS prov_city_ibge
      FROM public.user_data ud
      WHERE ud.tenant_id = s.tenant_id
        AND ud.active = true
      ORDER BY ud.created_at
      LIMIT 1
    ) prov ON true
    LEFT JOIN public.review_stats rs
      ON rs.domain = 'service' AND rs.reference_id = s.id::text
    WHERE s.active = true
      AND s.status = 'active'
      AND (p_category_id IS NULL OR s.category_id = p_category_id)
      AND (
        v_group_id IS NULL
        OR s.category_group_id = v_group_id
        OR EXISTS (
          SELECT 1
          FROM public.categories_group_link cgl
          WHERE cgl.category_id = s.category_id
            AND cgl.category_group_id = v_group_id
        )
      )
      AND (p_state IS NULL OR btrim(p_state) = '' OR prov.prov_state = p_state)
      AND (p_city_ibge IS NULL OR btrim(p_city_ibge) = '' OR prov.prov_city_ibge = p_city_ibge)
      AND (
        p_subcategories IS NULL
        OR jsonb_array_length(p_subcategories) = 0
        OR EXISTS (
          SELECT 1
          FROM public.service_categories_sub scs
          WHERE scs.service_id = s.id
            AND scs.active = true
            AND scs.category_sub_id IN (
              SELECT (value)::bigint FROM jsonb_array_elements_text(p_subcategories)
            )
        )
      )
      AND (
        v_query IS NULL
        OR to_tsvector('portuguese', unaccent(s.title || ' ' || COALESCE(s.description, ''))) @@ v_query
        OR unaccent(s.title) ILIKE '%' || unaccent(p_query) || '%'
      )
  )
  SELECT
    sf.uid,
    sf.title::character varying,
    sf.price::numeric,
    sf.price_type::character varying,
    sf.category::character varying,
    sf.subcategory::character varying,
    sf.sponsored,
    sf.cover_file_id::character varying,
    sf.provider_name::character varying,
    sf.provider_avatar::character varying,
    sf.rating::numeric,
    sf.reviews::integer
  FROM services_filtered sf
  ORDER BY
    CASE WHEN v_query IS NOT NULL THEN sf.text_rank END DESC NULLS LAST,
    sf.rating DESC NULLS LAST,
    (sf.provider_city IS NOT NULL) DESC,
    random()
  LIMIT p_page_size
  OFFSET (p_page * p_page_size);
END;
$function$;

-- Pública: a busca roda sem sessão. Só leitura (a função é o único ponto de acesso).
GRANT EXECUTE ON FUNCTION public.fn_search_services(character varying, integer, character varying, bigint, jsonb, text, double precision, integer, integer, text)
  TO anon, auth_user;

-- Plugin registration (see plugins/README.md convention). No auth.permissions rows: read-only
-- public search, nothing admin-manageable.
INSERT INTO auth.plugin_registry (name, version)
VALUES ('search', '1.0.0')
ON CONFLICT (name) DO UPDATE SET version = EXCLUDED.version;

NOTIFY pgrst, 'reload schema';

-- =====================================================================
-- kizuna-core/plugins/services/0003_service_addresses.sql
-- =====================================================================

-- plugins/services/0003_service_addresses.sql
-- Endereços do serviço (N por serviço): tabela filha `public.service_addresses`, no mesmo padrão
-- de `service_categories_sub` (FK ON DELETE CASCADE, tenant_id/created_by com default de JWT,
-- `active`, GRANTs, NOTIFY pgrst). Idempotente. Consumida por `search`/`swipe` (0002) via um único
-- EXISTS por (state, city_ibge) — nunca expor rua/número em RPC pública.
--
-- Leitura pública SÓ de endereço de serviço ativo e `status = 'active'` (tem rua e número);
-- o dono e quem tem `services:moderate` enxergam também os próprios/pendentes (espelha `services`).

-- =========================================================================
-- 1) Tabela + índices
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.service_addresses (
  id            bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  service_id    bigint NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  label         text,
  zip_code      varchar(10),
  street        text,
  number        text,
  complement    text,
  neighborhood  text,
  city          text,
  state         varchar(2),
  city_ibge     text,
  latitude      numeric(9,6),
  longitude     numeric(9,6),
  place_id      text,
  is_primary    boolean NOT NULL DEFAULT false,
  tenant_id     uuid NOT NULL DEFAULT auth.fun_auth_current_tenant_id(),
  created_by    uuid NOT NULL DEFAULT auth.fun_auth_user_id(),
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS service_addresses_service
  ON public.service_addresses (service_id, is_primary DESC) WHERE active;
CREATE INDEX IF NOT EXISTS service_addresses_state_city
  ON public.service_addresses (state, city_ibge) WHERE active;
CREATE INDEX IF NOT EXISTS service_addresses_city
  ON public.service_addresses (city_ibge) WHERE active AND city_ibge IS NOT NULL;
-- No máximo 1 endereço principal ativo por serviço.
CREATE UNIQUE INDEX IF NOT EXISTS service_addresses_one_primary
  ON public.service_addresses (service_id) WHERE is_primary AND active;

-- =========================================================================
-- 2) RLS + GRANTs
-- =========================================================================
ALTER TABLE public.service_addresses ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON TABLE public.service_addresses TO auth_user;
GRANT DELETE ON TABLE public.service_addresses TO auth_user;
GRANT SELECT ON TABLE public.service_addresses TO anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.service_addresses FROM anon;

DROP POLICY IF EXISTS sa_public_read ON public.service_addresses;
CREATE POLICY sa_public_read ON public.service_addresses FOR SELECT TO anon, auth_user
  USING (active AND EXISTS (
    SELECT 1 FROM public.services s
     WHERE s.id = service_id AND s.active AND s.status = 'active'));

DROP POLICY IF EXISTS sa_owner_write ON public.service_addresses;
CREATE POLICY sa_owner_write ON public.service_addresses FOR ALL TO auth_user
  USING (EXISTS (SELECT 1 FROM public.services s WHERE s.id = service_id AND s.created_by = auth.fun_auth_user_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.services s WHERE s.id = service_id AND s.created_by = auth.fun_auth_user_id()));

DROP POLICY IF EXISTS sa_moderator_read ON public.service_addresses;
CREATE POLICY sa_moderator_read ON public.service_addresses FOR SELECT TO auth_user
  USING (auth.fun_auth_has_perm('services','moderate'));

-- =========================================================================
-- 3) Backfill idempotente: 1 endereço principal por serviço ativo que ainda não tem nenhum,
--    a partir do user_data do prestador. Só se houver cidade ou UF. lat/lng (varchar) só entram
--    se forem numéricos e dentro da faixa válida.
-- =========================================================================
DO $$
BEGIN
  IF to_regclass('public.user_data') IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.service_addresses
    (service_id, zip_code, city, state, city_ibge, latitude, longitude, is_primary, tenant_id, created_by)
  SELECT
    s.id,
    NULLIF(btrim(prov.zip_code), ''),
    NULLIF(btrim(prov.city), ''),
    NULLIF(btrim(prov.state), ''),
    NULLIF(btrim(prov.city_ibge), ''),
    CASE WHEN btrim(prov.latitude)  ~ '^-?[0-9]{1,2}(\.[0-9]+)?$' AND abs(btrim(prov.latitude)::numeric)  <= 90
         THEN round(btrim(prov.latitude)::numeric, 6) END,
    CASE WHEN btrim(prov.longitude) ~ '^-?[0-9]{1,3}(\.[0-9]+)?$' AND abs(btrim(prov.longitude)::numeric) <= 180
         THEN round(btrim(prov.longitude)::numeric, 6) END,
    true,
    s.tenant_id,
    s.created_by
  FROM public.services s
  CROSS JOIN LATERAL (
    SELECT ud.city, ud.state, ud.city_ibge, ud.zip_code, ud.latitude, ud.longitude
      FROM public.user_data ud
     WHERE ud.tenant_id = s.tenant_id AND ud.active = true
     ORDER BY ud.created_at
     LIMIT 1
  ) prov
  WHERE s.active = true
    AND NOT EXISTS (SELECT 1 FROM public.service_addresses a WHERE a.service_id = s.id)
    AND (NULLIF(btrim(prov.city), '') IS NOT NULL OR NULLIF(btrim(prov.state), '') IS NOT NULL);
END $$;

-- =========================================================================
-- 4) Plugin registration
-- =========================================================================
INSERT INTO auth.plugin_registry (name, version)
VALUES ('services', '1.2.0')
ON CONFLICT (name) DO UPDATE SET version = EXCLUDED.version;

NOTIFY pgrst, 'reload schema';


-- =====================================================================
-- kizuna-core/plugins/services/0004_services_expires_at.sql
-- =====================================================================

-- plugins/services/0004_services_expires_at.sql
-- Validade do anúncio: `services.expires_at` (NULL = sem validade). Passado o instante, o anúncio
-- some da busca/swipe (filtro em fn_search_services, search 0002); `status` continua 'active'.
-- Idempotente. GRANTs/policies de `services` são por tabela (0001) e cobrem a coluna nova.

ALTER TABLE public.services ADD COLUMN IF NOT EXISTS expires_at timestamptz NULL;

COMMENT ON COLUMN public.services.expires_at IS
  'Fim da validade do anúncio (timestamptz). NULL = sem validade. Vencido: some da busca/swipe (status segue active).';

CREATE INDEX IF NOT EXISTS services_expires_at
  ON public.services (expires_at) WHERE active AND expires_at IS NOT NULL;

INSERT INTO auth.plugin_registry (name, version)
VALUES ('services', '1.3.0')
ON CONFLICT (name) DO UPDATE SET version = EXCLUDED.version;

NOTIFY pgrst, 'reload schema';


-- =====================================================================
-- kizuna-core/plugins/search/0002_search_addresses.sql
-- =====================================================================

-- plugins/search/0002_search_addresses.sql
-- fn_search_services passa a filtrar por local via `service_addresses` (plugin services 0003):
--  * sem p_state/p_city_ibge: nenhum custo de local;
--  * serviço com service_location = 'remoto' sempre passa o filtro de local;
--  * senão, UM ÚNICO EXISTS em service_addresses (state e city_ibge no MESMO endereço; usa os
--    índices parciais); serviço SEM nenhum endereço ativo cai no fallback antigo (user_data);
--  * continua 1 linha por serviço (semi-join, sem JOIN que duplique);
--  * city / state / address_count só são calculados para as linhas da página final (LATERAL depois
--    do LIMIT/OFFSET): endereço que casou com o filtro, depois o principal. Sem endereço: cidade/UF
--    do prestador e address_count = 0. NUNCA devolve rua/número.
-- Anúncio com `expires_at` no passado não entra (services 0004; NULL = sem validade).
-- Depende de `services` >= 1.3.0 (0003_service_addresses.sql + 0004_services_expires_at.sql).

DROP FUNCTION IF EXISTS public.fn_search_services(character varying, integer, character varying, bigint, jsonb, text, double precision, integer, integer, text);

CREATE OR REPLACE FUNCTION public.fn_search_services(
  p_state character varying,
  p_city_id integer,
  p_group_category_slug character varying,
  p_category_id bigint DEFAULT NULL::bigint,
  p_subcategories jsonb DEFAULT NULL::jsonb,
  p_query text DEFAULT NULL::text,
  p_seed double precision DEFAULT NULL::double precision,
  p_page integer DEFAULT 0,
  p_page_size integer DEFAULT 20,
  p_city_ibge text DEFAULT NULL::text
)
RETURNS TABLE(
  uid uuid,
  title character varying,
  price numeric,
  price_type character varying,
  category character varying,
  subcategory character varying,
  sponsored boolean,
  cover_file_id character varying,
  provider_name character varying,
  provider_avatar character varying,
  rating numeric,
  reviews integer,
  city text,
  state text,
  address_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_query tsquery;
  v_group_id bigint;
  v_state text := NULLIF(btrim(p_state), '');
  v_city  text := NULLIF(btrim(p_city_ibge), '');
  v_has_loc boolean;
BEGIN
  PERFORM setseed(COALESCE(p_seed, random()));
  v_has_loc := (v_state IS NOT NULL OR v_city IS NOT NULL);

  IF p_query IS NOT NULL AND btrim(p_query) <> '' THEN
    v_query := plainto_tsquery('portuguese', unaccent(p_query));
  END IF;

  IF p_group_category_slug IS NOT NULL AND btrim(p_group_category_slug) <> '' THEN
    SELECT cg.id INTO v_group_id
      FROM public.categories_group cg
     WHERE cg.slug = p_group_category_slug
       AND cg.active = true;

    IF v_group_id IS NULL THEN
      RETURN;
    END IF;
  END IF;

  RETURN QUERY
  WITH services_filtered AS MATERIALIZED (
    SELECT
      s.id                                 AS service_id,
      s.uid,
      s.title::character varying           AS title,
      s.starting_price::numeric            AS price,
      s.price_unit::character varying      AS price_type,
      c.name::character varying            AS category,
      sub.name::character varying          AS subcategory,
      COALESCE(s.sponsored, false)         AS sponsored,
      COALESCE(
        NULLIF(s.extras->>'coverFileId', ''),
        s.extras->'images'->>0
      )::character varying                 AS cover_file_id,
      COALESCE(prov.display_name, prov.full_name)::character varying AS provider_name,
      prov.avatar_url::character varying   AS provider_avatar,
      prov.prov_city                       AS provider_city,
      prov.prov_state                      AS provider_state,
      rs.average_rating::numeric           AS rating,
      COALESCE(rs.total_reviews, 0)::integer AS reviews,
      CASE
        WHEN v_query IS NOT NULL
        THEN ts_rank(
          to_tsvector('portuguese', unaccent(s.title || ' ' || COALESCE(s.description, ''))),
          v_query
        )
        ELSE 0::real
      END AS text_rank
    FROM public.services s
    LEFT JOIN public.categories c ON c.id = s.category_id
    LEFT JOIN LATERAL (
      SELECT cs.name
      FROM public.service_categories_sub scs
      JOIN public.categories_sub cs ON cs.id = scs.category_sub_id
      WHERE scs.service_id = s.id
        AND scs.active = true
        AND cs.active = true
      ORDER BY scs.id
      LIMIT 1
    ) sub ON true
    LEFT JOIN LATERAL (
      SELECT ud.full_name, ud.display_name, ud.avatar_url,
             ud.state AS prov_state, ud.city AS prov_city, ud.city_ibge AS prov_city_ibge
      FROM public.user_data ud
      WHERE ud.tenant_id = s.tenant_id
        AND ud.active = true
      ORDER BY ud.created_at
      LIMIT 1
    ) prov ON true
    LEFT JOIN public.review_stats rs
      ON rs.domain = 'service' AND rs.reference_id = s.id::text
    WHERE s.active = true
      AND s.status = 'active'
      AND (s.expires_at IS NULL OR s.expires_at > now())
      AND (p_category_id IS NULL OR s.category_id = p_category_id)
      AND (
        v_group_id IS NULL
        OR s.category_group_id = v_group_id
        OR EXISTS (
          SELECT 1
          FROM public.categories_group_link cgl
          WHERE cgl.category_id = s.category_id
            AND cgl.category_group_id = v_group_id
        )
      )
      AND (
        NOT v_has_loc
        OR s.service_location = 'remoto'
        OR EXISTS (
          SELECT 1
          FROM public.service_addresses a
          WHERE a.service_id = s.id
            AND a.active
            AND (v_state IS NULL OR a.state = v_state)
            AND (v_city  IS NULL OR a.city_ibge = v_city)
        )
        OR (
          NOT EXISTS (
            SELECT 1 FROM public.service_addresses a0
            WHERE a0.service_id = s.id AND a0.active
          )
          AND (v_state IS NULL OR prov.prov_state = v_state)
          AND (v_city  IS NULL OR prov.prov_city_ibge = v_city)
        )
      )
      AND (
        p_subcategories IS NULL
        OR jsonb_array_length(p_subcategories) = 0
        OR EXISTS (
          SELECT 1
          FROM public.service_categories_sub scs
          WHERE scs.service_id = s.id
            AND scs.active = true
            AND scs.category_sub_id IN (
              SELECT (value)::bigint FROM jsonb_array_elements_text(p_subcategories)
            )
        )
      )
      AND (
        v_query IS NULL
        OR to_tsvector('portuguese', unaccent(s.title || ' ' || COALESCE(s.description, ''))) @@ v_query
        OR unaccent(s.title) ILIKE '%' || unaccent(p_query) || '%'
      )
  ),
  page AS (
    SELECT sf.*, row_number() OVER () AS rn
    FROM (
      SELECT f.*
      FROM services_filtered f
      ORDER BY
        CASE WHEN v_query IS NOT NULL THEN f.text_rank END DESC NULLS LAST,
        f.rating DESC NULLS LAST,
        (f.provider_city IS NOT NULL) DESC,
        random()
      LIMIT p_page_size
      OFFSET (p_page * p_page_size)
    ) sf
  )
  SELECT
    pg.uid,
    pg.title::character varying,
    pg.price::numeric,
    pg.price_type::character varying,
    pg.category::character varying,
    pg.subcategory::character varying,
    pg.sponsored,
    pg.cover_file_id::character varying,
    pg.provider_name::character varying,
    pg.provider_avatar::character varying,
    pg.rating::numeric,
    pg.reviews::integer,
    COALESCE(ad.a_city, pg.provider_city)::text,
    COALESCE(ad.a_state, pg.provider_state)::text,
    COALESCE(ad.cnt, 0)::integer
  FROM page pg
  LEFT JOIN LATERAL (
    SELECT a.city AS a_city, a.state AS a_state, count(*) OVER () AS cnt
    FROM public.service_addresses a
    WHERE a.service_id = pg.service_id
      AND a.active
    ORDER BY
      (v_has_loc
       AND (v_state IS NULL OR a.state = v_state)
       AND (v_city  IS NULL OR a.city_ibge = v_city)) DESC,
      a.is_primary DESC,
      a.id
    LIMIT 1
  ) ad ON true
  ORDER BY pg.rn;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_search_services(character varying, integer, character varying, bigint, jsonb, text, double precision, integer, integer, text)
  TO anon, auth_user;

INSERT INTO auth.plugin_registry (name, version)
VALUES ('search', '1.1.0')
ON CONFLICT (name) DO UPDATE SET version = EXCLUDED.version;

NOTIFY pgrst, 'reload schema';


-- =====================================================================
-- kizuna-core/plugins/swipe/0002_swipe_addresses.sql
-- =====================================================================

-- plugins/swipe/0002_swipe_addresses.sql
-- Endereços do serviço no swipe: fn_swipe_deck herda de fn_search_services (search 0002) as colunas
-- city / state / address_count; fn_swipe_liked devolve as mesmas (endereço principal + contagem,
-- via LATERAL LIMIT 1, sem duplicar linhas). Nunca devolve rua/número.
-- Depende de `search` >= 1.1.0 e `services` >= 1.2.0.

DROP FUNCTION IF EXISTS public.fn_swipe_deck(character varying, integer, character varying, bigint, jsonb, text, double precision, integer, text, uuid[], numeric, numeric);

CREATE OR REPLACE FUNCTION public.fn_swipe_deck(
  p_state character varying,
  p_city_id integer,
  p_group_category_slug character varying,
  p_category_id bigint DEFAULT NULL::bigint,
  p_subcategories jsonb DEFAULT NULL::jsonb,
  p_query text DEFAULT NULL::text,
  p_seed double precision DEFAULT NULL::double precision,
  p_page_size integer DEFAULT 20,
  p_city_ibge text DEFAULT NULL::text,
  p_exclude uuid[] DEFAULT NULL::uuid[],
  p_price_min numeric DEFAULT NULL::numeric,
  p_price_max numeric DEFAULT NULL::numeric
)
RETURNS TABLE(
  uid uuid,
  title character varying,
  price numeric,
  price_type character varying,
  category character varying,
  subcategory character varying,
  sponsored boolean,
  cover_file_id character varying,
  provider_name character varying,
  provider_avatar character varying,
  rating numeric,
  reviews integer,
  city text,
  state text,
  address_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user uuid := auth.fun_auth_user_id();
  v_ttl interval := make_interval(days => COALESCE(
    NULLIF((SELECT value #>> '{}' FROM auth.system_config WHERE key = 'swipe.skip_ttl_days'), '')::integer,
    7
  ));
BEGIN
  RETURN QUERY
  SELECT c.*
  FROM public.fn_search_services(
    p_state, p_city_id, p_group_category_slug, p_category_id, p_subcategories,
    p_query, p_seed, 0, 1000, p_city_ibge
  ) c
  WHERE (p_exclude IS NULL OR NOT (c.uid = ANY(p_exclude)))
    AND (p_price_min IS NULL OR c.price IS NULL OR c.price <= 0 OR c.price >= p_price_min)
    AND (p_price_max IS NULL OR c.price IS NULL OR c.price <= 0 OR c.price <= p_price_max)
    AND (
      v_user IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM public.service_swipes sw
        WHERE sw.user_id = v_user
          AND sw.service_uid = c.uid
          AND (sw.action = 'like' OR sw.updated_at > now() - v_ttl)
      )
    )
  LIMIT LEAST(GREATEST(p_page_size, 1), 50);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_swipe_deck(character varying, integer, character varying, bigint, jsonb, text, double precision, integer, text, uuid[], numeric, numeric)
  TO anon, auth_user;

DROP FUNCTION IF EXISTS public.fn_swipe_liked(timestamptz, integer);

CREATE OR REPLACE FUNCTION public.fn_swipe_liked(p_before timestamptz DEFAULT NULL, p_page_size integer DEFAULT 24)
RETURNS TABLE(
  uid uuid,
  title character varying,
  price numeric,
  price_type character varying,
  category character varying,
  cover_file_id character varying,
  liked_at timestamptz,
  city text,
  state text,
  address_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user uuid := auth.fun_auth_user_id();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'login necessario' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT
    s.uid,
    s.title::character varying,
    s.starting_price::numeric,
    s.price_unit::character varying,
    c.name::character varying,
    COALESCE(NULLIF(s.extras->>'coverFileId', ''), s.extras->'images'->>0)::character varying,
    sw.updated_at,
    ad.a_city::text,
    ad.a_state::text,
    COALESCE(ad.cnt, 0)::integer
  FROM public.service_swipes sw
  JOIN public.services s ON s.uid = sw.service_uid
  LEFT JOIN public.categories c ON c.id = s.category_id
  LEFT JOIN LATERAL (
    SELECT a.city AS a_city, a.state AS a_state, count(*) OVER () AS cnt
    FROM public.service_addresses a
    WHERE a.service_id = s.id
      AND a.active
    ORDER BY a.is_primary DESC, a.id
    LIMIT 1
  ) ad ON true
  WHERE sw.user_id = v_user
    AND sw.action = 'like'
    AND s.active = true
    AND s.status = 'active'
    AND (p_before IS NULL OR sw.updated_at < p_before)
  ORDER BY sw.updated_at DESC
  LIMIT LEAST(GREATEST(p_page_size, 1), 100);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_swipe_liked(timestamptz, integer) TO auth_user;

INSERT INTO auth.plugin_registry (name, version)
VALUES ('swipe', '1.1.0')
ON CONFLICT (name) DO UPDATE SET version = EXCLUDED.version;

NOTIFY pgrst, 'reload schema';


-- =====================================================================
-- kizuna-core/db/extras/forms_seed_cinema.sql
-- =====================================================================

-- db/extras/forms_seed_cinema.sql
--
-- Seed do formulario `cinema` (plugin forms): os campos do contrato do cinema que NAO tem coluna
-- propria em `services` — contato, dados do filme e a lista de sessoes (campo `list`). Titulo,
-- descricao, preco, localizacao, imagens e validade ficam de fora (ja tem coluna/passo proprio).
-- Chaves planas em snake_case (contato_*, detalhes_*, sessoes); o crawler grava as respostas com
-- fn_form_result_upsert('cinema', 'service', '<service_id>', <answers>).
--
-- Tambem vincula a categoria `cinema` ao formulario (categories.form_key), sem sobrescrever um
-- form_key que ja esteja definido.
--
-- Pre-requisitos: schema do core + plugins forms e taxonomy aplicados, e um usuario root ja
-- cadastrado (tenant_id/created_by vem do primeiro root e do tenant dele; sem root o INSERT vira
-- no-op silencioso, igual ao seed de taxonomia).
--
-- Idempotente: casa por (tenant_id, form_key); `version` so sobe se o schema mudar (trigger).
--
-- Aplicar:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/extras/forms_seed_cinema.sql
--   (Docker: docker exec -i <container> psql -U <user> -d <db> -v ON_ERROR_STOP=1 < db/extras/forms_seed_cinema.sql)


INSERT INTO public.forms (tenant_id, form_key, title, description, schema, active, created_by)
SELECT t.uid, 'cinema', 'Cinema — sessões e detalhes',
       'Contato, dados do filme e sessões do cinema.', $cinema_schema$
{
  "title": "Cinema — sessões e detalhes",
  "description": "Contato, dados do filme e sessões do cinema.",
  "fields": [
    {
      "id": "cin_01_secao_contato",
      "key": "secao_contato",
      "name": "secao_contato",
      "type": "heading",
      "label": "Contato",
      "grid": {
        "xs": 12,
        "sm": 12,
        "md": 12,
        "lg": 12,
        "xl": 12,
        "2xl": 12
      },
      "behavior": {},
      "validation": {},
      "appearance": {}
    },
    {
      "id": "cin_02_contato_telefone",
      "key": "contato_telefone",
      "name": "contato_telefone",
      "type": "phone",
      "label": "Telefone",
      "grid": {
        "xs": 12,
        "sm": 12,
        "md": 6,
        "lg": 6,
        "xl": 6,
        "2xl": 6
      },
      "behavior": {},
      "validation": {},
      "appearance": {}
    },
    {
      "id": "cin_03_contato_whatsapp",
      "key": "contato_whatsapp",
      "name": "contato_whatsapp",
      "type": "phone",
      "label": "WhatsApp",
      "grid": {
        "xs": 12,
        "sm": 12,
        "md": 6,
        "lg": 6,
        "xl": 6,
        "2xl": 6
      },
      "behavior": {},
      "validation": {},
      "appearance": {}
    },
    {
      "id": "cin_04_contato_email",
      "key": "contato_email",
      "name": "contato_email",
      "type": "email",
      "label": "E-mail",
      "grid": {
        "xs": 12,
        "sm": 12,
        "md": 6,
        "lg": 6,
        "xl": 6,
        "2xl": 6
      },
      "behavior": {},
      "validation": {},
      "appearance": {}
    },
    {
      "id": "cin_05_contato_site",
      "key": "contato_site",
      "name": "contato_site",
      "type": "url",
      "label": "Site",
      "grid": {
        "xs": 12,
        "sm": 12,
        "md": 6,
        "lg": 6,
        "xl": 6,
        "2xl": 6
      },
      "behavior": {},
      "validation": {},
      "appearance": {}
    },
    {
      "id": "cin_06_contato_link_ingresso",
      "key": "contato_link_ingresso",
      "name": "contato_link_ingresso",
      "type": "url",
      "label": "Link para ingressos",
      "grid": {
        "xs": 12,
        "sm": 12,
        "md": 12,
        "lg": 12,
        "xl": 12,
        "2xl": 12
      },
      "behavior": {},
      "validation": {},
      "appearance": {}
    },
    {
      "id": "cin_07_secao_filme",
      "key": "secao_filme",
      "name": "secao_filme",
      "type": "heading",
      "label": "Filme",
      "grid": {
        "xs": 12,
        "sm": 12,
        "md": 12,
        "lg": 12,
        "xl": 12,
        "2xl": 12
      },
      "behavior": {},
      "validation": {},
      "appearance": {}
    },
    {
      "id": "cin_08_detalhes_titulo_obra",
      "key": "detalhes_titulo_obra",
      "name": "detalhes_titulo_obra",
      "type": "text",
      "label": "Título da obra",
      "grid": {
        "xs": 12,
        "sm": 12,
        "md": 6,
        "lg": 6,
        "xl": 6,
        "2xl": 6
      },
      "behavior": {
        "required": true
      },
      "validation": {},
      "appearance": {}
    },
    {
      "id": "cin_09_detalhes_titulo_original",
      "key": "detalhes_titulo_original",
      "name": "detalhes_titulo_original",
      "type": "text",
      "label": "Título original",
      "grid": {
        "xs": 12,
        "sm": 12,
        "md": 6,
        "lg": 6,
        "xl": 6,
        "2xl": 6
      },
      "behavior": {},
      "validation": {},
      "appearance": {}
    },
    {
      "id": "cin_10_detalhes_classificacao_indicativa",
      "key": "detalhes_classificacao_indicativa",
      "name": "detalhes_classificacao_indicativa",
      "type": "text",
      "label": "Classificação indicativa",
      "grid": {
        "xs": 12,
        "sm": 12,
        "md": 6,
        "lg": 6,
        "xl": 6,
        "2xl": 6
      },
      "behavior": {},
      "validation": {},
      "appearance": {},
      "placeholder": "Ex.: 12 anos"
    },
    {
      "id": "cin_11_detalhes_duracao_min",
      "key": "detalhes_duracao_min",
      "name": "detalhes_duracao_min",
      "type": "number",
      "label": "Duração (minutos)",
      "grid": {
        "xs": 12,
        "sm": 12,
        "md": 6,
        "lg": 6,
        "xl": 6,
        "2xl": 6
      },
      "behavior": {},
      "validation": {
        "min": 1
      },
      "appearance": {}
    },
    {
      "id": "cin_12_detalhes_ano_lancamento",
      "key": "detalhes_ano_lancamento",
      "name": "detalhes_ano_lancamento",
      "type": "number",
      "label": "Ano de lançamento",
      "grid": {
        "xs": 12,
        "sm": 12,
        "md": 6,
        "lg": 6,
        "xl": 6,
        "2xl": 6
      },
      "behavior": {},
      "validation": {},
      "appearance": {}
    },
    {
      "id": "cin_13_detalhes_distribuidora",
      "key": "detalhes_distribuidora",
      "name": "detalhes_distribuidora",
      "type": "text",
      "label": "Distribuidora",
      "grid": {
        "xs": 12,
        "sm": 12,
        "md": 6,
        "lg": 6,
        "xl": 6,
        "2xl": 6
      },
      "behavior": {},
      "validation": {},
      "appearance": {}
    },
    {
      "id": "cin_14_detalhes_avisos_classificacao",
      "key": "detalhes_avisos_classificacao",
      "name": "detalhes_avisos_classificacao",
      "type": "multiselect",
      "label": "Avisos da classificação",
      "grid": {
        "xs": 12,
        "sm": 12,
        "md": 12,
        "lg": 12,
        "xl": 12,
        "2xl": 12
      },
      "behavior": {},
      "validation": {},
      "appearance": {},
      "options": [
        {
          "label": "Medo",
          "value": "Medo"
        },
        {
          "label": "Violência",
          "value": "Violência"
        },
        {
          "label": "Drogas",
          "value": "Drogas"
        },
        {
          "label": "Sexo",
          "value": "Sexo"
        },
        {
          "label": "Nudez",
          "value": "Nudez"
        },
        {
          "label": "Linguagem imprópria",
          "value": "Linguagem imprópria"
        },
        {
          "label": "Discriminação",
          "value": "Discriminação"
        },
        {
          "label": "Conteúdo sexual",
          "value": "Conteúdo sexual"
        }
      ]
    },
    {
      "id": "cin_15_detalhes_genero",
      "key": "detalhes_genero",
      "name": "detalhes_genero",
      "type": "multiselect",
      "label": "Gênero",
      "grid": {
        "xs": 12,
        "sm": 12,
        "md": 12,
        "lg": 12,
        "xl": 12,
        "2xl": 12
      },
      "behavior": {},
      "validation": {},
      "appearance": {},
      "options": [
        {
          "label": "Ação",
          "value": "Ação"
        },
        {
          "label": "Animação",
          "value": "Animação"
        },
        {
          "label": "Aventura",
          "value": "Aventura"
        },
        {
          "label": "Comédia",
          "value": "Comédia"
        },
        {
          "label": "Documentário",
          "value": "Documentário"
        },
        {
          "label": "Drama",
          "value": "Drama"
        },
        {
          "label": "Fantasia",
          "value": "Fantasia"
        },
        {
          "label": "Ficção científica",
          "value": "Ficção científica"
        },
        {
          "label": "Romance",
          "value": "Romance"
        },
        {
          "label": "Suspense",
          "value": "Suspense"
        },
        {
          "label": "Terror",
          "value": "Terror"
        },
        {
          "label": "Musical",
          "value": "Musical"
        },
        {
          "label": "Família",
          "value": "Família"
        }
      ]
    },
    {
      "id": "cin_16_detalhes_idiomas",
      "key": "detalhes_idiomas",
      "name": "detalhes_idiomas",
      "type": "multiselect",
      "label": "Idiomas",
      "grid": {
        "xs": 12,
        "sm": 12,
        "md": 6,
        "lg": 6,
        "xl": 6,
        "2xl": 6
      },
      "behavior": {},
      "validation": {},
      "appearance": {},
      "options": [
        {
          "label": "Dublado",
          "value": "Dublado"
        },
        {
          "label": "Legendado",
          "value": "Legendado"
        },
        {
          "label": "Nacional",
          "value": "Nacional"
        }
      ]
    },
    {
      "id": "cin_17_detalhes_formatos",
      "key": "detalhes_formatos",
      "name": "detalhes_formatos",
      "type": "multiselect",
      "label": "Formatos",
      "grid": {
        "xs": 12,
        "sm": 12,
        "md": 6,
        "lg": 6,
        "xl": 6,
        "2xl": 6
      },
      "behavior": {},
      "validation": {},
      "appearance": {},
      "options": [
        {
          "label": "2D",
          "value": "2D"
        },
        {
          "label": "3D",
          "value": "3D"
        },
        {
          "label": "IMAX",
          "value": "IMAX"
        },
        {
          "label": "D-Box",
          "value": "D-Box"
        },
        {
          "label": "4DX",
          "value": "4DX"
        },
        {
          "label": "XD",
          "value": "XD"
        },
        {
          "label": "MACRO XE",
          "value": "MACRO XE"
        },
        {
          "label": "Prime",
          "value": "Prime"
        },
        {
          "label": "VIP",
          "value": "VIP"
        },
        {
          "label": "Cinépolis Junior",
          "value": "Cinépolis Junior"
        }
      ]
    },
    {
      "id": "cin_18_detalhes_pre_venda",
      "key": "detalhes_pre_venda",
      "name": "detalhes_pre_venda",
      "type": "switch",
      "label": "Pré-venda",
      "grid": {
        "xs": 12,
        "sm": 12,
        "md": 6,
        "lg": 6,
        "xl": 6,
        "2xl": 6
      },
      "behavior": {},
      "validation": {},
      "appearance": {}
    },
    {
      "id": "cin_19_detalhes_reexibicao",
      "key": "detalhes_reexibicao",
      "name": "detalhes_reexibicao",
      "type": "switch",
      "label": "Reexibição",
      "grid": {
        "xs": 12,
        "sm": 12,
        "md": 6,
        "lg": 6,
        "xl": 6,
        "2xl": 6
      },
      "behavior": {},
      "validation": {},
      "appearance": {}
    },
    {
      "id": "cin_20_detalhes_trailer_url",
      "key": "detalhes_trailer_url",
      "name": "detalhes_trailer_url",
      "type": "url",
      "label": "Trailer (URL)",
      "grid": {
        "xs": 12,
        "sm": 12,
        "md": 12,
        "lg": 12,
        "xl": 12,
        "2xl": 12
      },
      "behavior": {},
      "validation": {},
      "appearance": {}
    },
    {
      "id": "cin_21_secao_sessoes",
      "key": "secao_sessoes",
      "name": "secao_sessoes",
      "type": "heading",
      "label": "Sessões",
      "grid": {
        "xs": 12,
        "sm": 12,
        "md": 12,
        "lg": 12,
        "xl": 12,
        "2xl": 12
      },
      "behavior": {},
      "validation": {},
      "appearance": {}
    },
    {
      "id": "cin_30_sessoes",
      "key": "sessoes",
      "name": "sessoes",
      "type": "list",
      "label": "Sessões",
      "grid": {
        "xs": 12,
        "sm": 12,
        "md": 12,
        "lg": 12,
        "xl": 12,
        "2xl": 12
      },
      "behavior": {},
      "validation": {},
      "appearance": {},
      "itemFields": [
        {
          "id": "sess_id_origem",
          "key": "id_origem",
          "name": "id_origem",
          "type": "text",
          "label": "ID de origem",
          "grid": {
            "xs": 12,
            "sm": 12,
            "md": 6,
            "lg": 3,
            "xl": 3,
            "2xl": 3
          },
          "behavior": {
            "readOnly": true
          },
          "validation": {},
          "appearance": {}
        },
        {
          "id": "sess_data",
          "key": "data",
          "name": "data",
          "type": "date",
          "label": "Data",
          "grid": {
            "xs": 12,
            "sm": 12,
            "md": 6,
            "lg": 3,
            "xl": 3,
            "2xl": 3
          },
          "behavior": {
            "required": true
          },
          "validation": {},
          "appearance": {}
        },
        {
          "id": "sess_horario",
          "key": "horario",
          "name": "horario",
          "type": "time",
          "label": "Horário",
          "grid": {
            "xs": 12,
            "sm": 12,
            "md": 6,
            "lg": 3,
            "xl": 3,
            "2xl": 3
          },
          "behavior": {
            "required": true
          },
          "validation": {},
          "appearance": {}
        },
        {
          "id": "sess_preco",
          "key": "preco",
          "name": "preco",
          "type": "currency",
          "label": "Preço",
          "grid": {
            "xs": 12,
            "sm": 12,
            "md": 6,
            "lg": 3,
            "xl": 3,
            "2xl": 3
          },
          "behavior": {},
          "validation": {
            "min": 0
          },
          "appearance": {}
        },
        {
          "id": "sess_sala",
          "key": "sala",
          "name": "sala",
          "type": "text",
          "label": "Sala",
          "grid": {
            "xs": 12,
            "sm": 12,
            "md": 6,
            "lg": 3,
            "xl": 3,
            "2xl": 3
          },
          "behavior": {},
          "validation": {},
          "appearance": {}
        },
        {
          "id": "sess_tipo",
          "key": "tipo",
          "name": "tipo",
          "type": "multiselect",
          "label": "Tipo da sessão",
          "grid": {
            "xs": 12,
            "sm": 12,
            "md": 12,
            "lg": 6,
            "xl": 6,
            "2xl": 6
          },
          "behavior": {},
          "validation": {},
          "appearance": {},
          "options": [
            {
              "label": "Dublado",
              "value": "Dublado"
            },
            {
              "label": "Legendado",
              "value": "Legendado"
            },
            {
              "label": "Nacional",
              "value": "Nacional"
            },
            {
              "label": "2D",
              "value": "2D"
            },
            {
              "label": "3D",
              "value": "3D"
            },
            {
              "label": "IMAX",
              "value": "IMAX"
            },
            {
              "label": "D-Box",
              "value": "D-Box"
            },
            {
              "label": "4DX",
              "value": "4DX"
            },
            {
              "label": "XD",
              "value": "XD"
            },
            {
              "label": "VIP",
              "value": "VIP"
            },
            {
              "label": "MACRO XE",
              "value": "MACRO XE"
            },
            {
              "label": "Prime",
              "value": "Prime"
            },
            {
              "label": "Cinépolis Junior",
              "value": "Cinépolis Junior"
            }
          ]
        },
        {
          "id": "sess_url_compra",
          "key": "url_compra",
          "name": "url_compra",
          "type": "url",
          "label": "Link de compra",
          "grid": {
            "xs": 12,
            "sm": 12,
            "md": 12,
            "lg": 6,
            "xl": 6,
            "2xl": 6
          },
          "behavior": {},
          "validation": {},
          "appearance": {}
        },
        {
          "id": "sess_lugares_disponiveis",
          "key": "lugares_disponiveis",
          "name": "lugares_disponiveis",
          "type": "number",
          "label": "Lugares disponíveis",
          "grid": {
            "xs": 12,
            "sm": 12,
            "md": 6,
            "lg": 3,
            "xl": 3,
            "2xl": 3
          },
          "behavior": {
            "readOnly": true
          },
          "validation": {},
          "appearance": {}
        }
      ],
      "itemLabel": "Sessão",
      "minItems": 1
    }
  ]
}
$cinema_schema$::jsonb, true, u.uid
FROM (SELECT uid FROM auth.users WHERE is_root = true ORDER BY created_at ASC LIMIT 1) AS u
JOIN LATERAL (
    SELECT tn.uid FROM auth.tenants tn WHERE tn.owner_uid = u.uid ORDER BY tn.created_at ASC LIMIT 1
) AS t ON true
ON CONFLICT (tenant_id, form_key) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  schema = EXCLUDED.schema,
  active = true;

UPDATE public.categories SET form_key = 'cinema'
WHERE slug = 'cinema' AND (form_key IS NULL OR form_key = '');

COMMIT;
