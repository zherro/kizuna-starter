-- Migrations pendentes (2026-09-24) — idempotentes, seguras para rodar mais de uma vez.
--   1. core    sql/0112_password_reset.sql            (esqueci minha senha)
--   2. plugin  services/0002_services_category_stats_view.sql
--   3. plugin  search/0001_search.sql
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

COMMIT;
