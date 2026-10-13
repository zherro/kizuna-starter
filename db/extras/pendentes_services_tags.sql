-- db/extras/pendentes_services_tags.sql
--
-- Leva um banco JÁ EM PRODUÇÃO às tags genéricas e ao código/vínculos de anúncio
-- (`services.extras.tags`, `extras.codigo`, `extras.vinculosTitulo`):
--   1) índices parciais de `services` (plugin services 0011): GIN `services_extras_tags` sobre
--      `extras->'tags'` e btree `services_extras_codigo` sobre `extras->>'codigo'`;
--   2) permissão `services.link`, trigger de validação/permissão dessas chaves e índice UNIQUE
--      parcial do código (plugin services 0012; a permissão NÃO é concedida a nenhum papel);
--   3) `fn_search_services` com o parâmetro novo `p_tags jsonb` no fim (plugin search 0008).
-- Nenhuma linha é alterada. O trigger só barra gravação futura das três chaves por quem não tem a
-- permissão (sessões de sistema, sem JWT, passam). O UNIQUE é pulado com NOTICE se já houver código
-- repetido. Atômico (uma transação) e idempotente (rodar de novo não falha nem duplica). Mesmo conteúdo dos dois arquivos do core;
-- quem instala pelo CLI (`node kizuna-core/cli db migrate`) não precisa deste arquivo.
--
-- Aplicar ANTES do deploy do app novo (o app antigo segue chamando a RPC sem `p_tags`, que
-- continua válida pelo DEFAULT; o app novo só manda `p_tags` quando há tags):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/extras/pendentes_services_tags.sql
--   (ou: node kizuna-core/cli db run db/extras/pendentes_services_tags.sql)
--
-- Os CREATE INDEX (sem CONCURRENTLY, que não roda em transação) seguram escritas em `services`
-- enquanto os índices são montados: segundos numa tabela de milhares de linhas.
--
-- ROLLBACK (volta a assinatura de 13 parâmetros da 0007 e remove índices, trigger e permissão; depois do rollback o
-- app novo não acha `p_tags` na RPC — faça o rollback do app antes ou junto):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 \
--     -c "DROP FUNCTION IF EXISTS public.fn_search_services(character varying, integer, character varying, bigint, jsonb, text, double precision, integer, integer, text, text[], text[], bigint[], jsonb);" \
--     -f kizuna-core/plugins/search/0007_search_category_ids.sql \
--     -c "DROP INDEX IF EXISTS public.services_extras_tags;" \
--     -c "DROP INDEX IF EXISTS public.services_extras_codigo;" \
--     -c "DROP TRIGGER IF EXISTS trg_services_extras_links_guard ON public.services;" \
--     -c "DROP FUNCTION IF EXISTS public.fn_services_extras_links_guard();" \
--     -c "DROP INDEX IF EXISTS public.services_extras_codigo_uniq;" \
--     -c "DELETE FROM auth.role_grants WHERE permission_id IN (SELECT id FROM auth.permissions WHERE resource = 'services' AND action = 'link');" \
--     -c "DELETE FROM auth.user_tenant_permissions WHERE permission_id IN (SELECT id FROM auth.permissions WHERE resource = 'services' AND action = 'link');" \
--     -c "DELETE FROM auth.permissions WHERE resource = 'services' AND action = 'link';" \
--     -c "UPDATE auth.plugin_registry SET version = '1.5.0' WHERE name = 'services';"
--   (`-1` = tudo numa transação; a 0007 recria a função antiga, refaz o GRANT, grava search 1.6.0
--   e manda o NOTIFY pgrst.)

BEGIN;

-- Se algum DDL não conseguir o lock em 5 s (escritas longas em `services`), o script inteiro aborta
-- e desfaz tudo (é uma transação só): basta rodar de novo fora do horário de pico.
SET LOCAL lock_timeout = '5s';

-- ============================== plugins/services/0011_services_tags_index.sql
CREATE INDEX IF NOT EXISTS services_extras_tags
  ON public.services USING gin ((extras -> 'tags'))
  WHERE active AND status = 'active';

CREATE INDEX IF NOT EXISTS services_extras_codigo
  ON public.services ((extras ->> 'codigo'))
  WHERE active AND status = 'active' AND (extras ->> 'codigo') IS NOT NULL;

INSERT INTO auth.plugin_registry (name, version)
VALUES ('services', '1.6.0')
ON CONFLICT (name) DO UPDATE SET version = EXCLUDED.version;

-- ============================== plugins/services/0012_services_links_guard.sql
INSERT INTO auth.permissions (resource, action, name) VALUES
  ('services', 'link', 'Definir código e vínculos do anúncio')
ON CONFLICT (resource, action) DO NOTHING;

CREATE OR REPLACE FUNCTION public.fn_services_extras_links_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, auth
AS $function$
DECLARE
  v_key     text;
  v_new     jsonb;
  v_old     jsonb;
  v_el      jsonb;
  v_changed boolean := false;
  v_claims  text := nullif(current_setting('request.jwt.claims', true), '');
  v_uid     text;
BEGIN
  FOREACH v_key IN ARRAY ARRAY['codigo', 'tags', 'vinculosTitulo'] LOOP
    v_new := NEW.extras -> v_key;
    v_old := CASE WHEN TG_OP = 'UPDATE' THEN OLD.extras -> v_key END;
    -- ausente, null, '' e [] são "vazio"
    IF v_new IS NOT NULL AND (v_new = 'null'::jsonb OR v_new = '""'::jsonb OR v_new = '[]'::jsonb) THEN
      v_new := NULL;
    END IF;
    IF v_old IS NOT NULL AND (v_old = 'null'::jsonb OR v_old = '""'::jsonb OR v_old = '[]'::jsonb) THEN
      v_old := NULL;
    END IF;
    CONTINUE WHEN v_new IS NOT DISTINCT FROM v_old;
    v_changed := true;
    CONTINUE WHEN v_new IS NULL;  -- limpar o campo não precisa validar formato

    IF v_key = 'codigo' THEN
      IF jsonb_typeof(v_new) <> 'string' OR (v_new #>> '{}') !~ '^[a-z0-9][a-z0-9._-]{0,59}$' THEN
        RAISE EXCEPTION 'código inválido: use minúsculas, números, ponto, hífen ou sublinhado (até 60 caracteres)'
          USING ERRCODE = '22023';
      END IF;
    ELSIF v_key = 'tags' THEN
      IF jsonb_typeof(v_new) <> 'array' OR jsonb_array_length(v_new) > 10 THEN
        RAISE EXCEPTION 'tags inválidas: lista de até 10 itens' USING ERRCODE = '22023';
      END IF;
      FOR v_el IN SELECT value FROM jsonb_array_elements(v_new) LOOP
        IF jsonb_typeof(v_el) <> 'string' OR (v_el #>> '{}') !~ '^[a-z0-9][a-z0-9:._-]{0,59}$' THEN
          RAISE EXCEPTION 'tag inválida: use minúsculas, números, dois-pontos, ponto, hífen ou sublinhado (até 60 caracteres)'
            USING ERRCODE = '22023';
        END IF;
      END LOOP;
    ELSE
      IF jsonb_typeof(v_new) <> 'string' OR char_length(v_new #>> '{}') > 60 THEN
        RAISE EXCEPTION 'título dos vinculados inválido: texto de até 60 caracteres' USING ERRCODE = '22023';
      END IF;
    END IF;
  END LOOP;

  IF NOT v_changed THEN
    RETURN NEW;
  END IF;

  -- sessão de sistema: sem usuário no JWT e papel que não é de requisição pública
  IF v_claims IS NOT NULL THEN
    BEGIN
      v_uid := v_claims::jsonb ->> 'user_id';
    EXCEPTION WHEN others THEN
      v_uid := NULL;
    END;
  END IF;
  IF v_uid IS NULL AND current_user NOT IN ('anon', 'auth_user') THEN
    RETURN NEW;
  END IF;

  IF auth.fun_auth_has_perm('services', 'link') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'sem permissão para definir código/vínculos do anúncio' USING ERRCODE = '42501';
END;
$function$;

DROP TRIGGER IF EXISTS trg_services_extras_links_guard ON public.services;
CREATE TRIGGER trg_services_extras_links_guard
  BEFORE INSERT OR UPDATE OF extras ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.fn_services_extras_links_guard();

-- Unicidade GLOBAL do código entre anúncios não arquivados (a busca do organizador e o carrossel de
-- vinculados não filtram por tenant, então o índice também não). Não aborta a migração se já houver
-- duplicata: emite WARNING e pula. Uma versão antiga deste índice (por tenant) é substituída.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = 'services_extras_codigo_uniq'
       AND indexdef LIKE '%tenant_id%'
  ) THEN
    DROP INDEX public.services_extras_codigo_uniq;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.services
     WHERE active AND status <> 'archived' AND (extras ->> 'codigo') IS NOT NULL
     GROUP BY (extras ->> 'codigo')
    HAVING count(*) > 1
  ) THEN
    RAISE WARNING 'services_extras_codigo_uniq NAO foi criado: ha extras.codigo repetido entre anuncios ativos nao arquivados. Liste com: SELECT extras->>''codigo'' AS codigo, count(*), array_agg(uid) FROM public.services WHERE active AND status <> ''archived'' AND (extras->>''codigo'') IS NOT NULL GROUP BY 1 HAVING count(*) > 1;  Corrija (troque o codigo ou arquive os repetidos) e EXECUTE ESTE ARQUIVO DE NOVO (plugins/services/0012_services_links_guard.sql ou db/extras/pendentes_services_tags.sql). `db migrate` NAO o reexecuta: a versao do plugin services ja foi atualizada.';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS services_extras_codigo_uniq
      ON public.services ((extras ->> 'codigo'))
      WHERE active AND status <> 'archived' AND (extras ->> 'codigo') IS NOT NULL;
  END IF;
END
$$;

INSERT INTO auth.plugin_registry (name, version)
VALUES ('services', '1.7.0')
ON CONFLICT (name) DO UPDATE SET version = EXCLUDED.version;


-- ============================== plugins/search/0008_search_tags.sql
DROP FUNCTION IF EXISTS public.fn_search_services(character varying, integer, character varying, bigint, jsonb, text, double precision, integer, integer, text, text[], text[], bigint[]);

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
  p_city_ibge text DEFAULT NULL::text,
  p_exclude_category_slugs text[] DEFAULT NULL::text[],
  p_city_ibges text[] DEFAULT NULL::text[],
  p_category_ids bigint[] DEFAULT NULL::bigint[],
  p_tags jsonb DEFAULT NULL::jsonb
)
RETURNS TABLE(
  uid uuid,
  title character varying,
  price numeric,
  price_type character varying,
  category character varying,
  category_slug character varying,
  category_group_slug character varying,
  subcategory character varying,
  sponsored boolean,
  cover_file_id character varying,
  provider_name character varying,
  provider_avatar character varying,
  rating numeric,
  reviews integer,
  city text,
  state text,
  address_count integer,
  event_start character varying,
  venue character varying
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
  -- cidades aceitas: a lista de irmãs (sem vazios) ou só a selecionada; NULL = sem filtro de cidade
  v_cities text[];
  v_has_loc boolean;
  -- tags pedidas (normalizadas, sem vazias); NULL = sem filtro de tag
  v_tags text[];
  -- anúncios publicados com alguma das tags; NULL = sem filtro de tag
  v_tag_ids bigint[];
BEGIN
  PERFORM setseed(COALESCE(p_seed, random()));
  SELECT array_agg(DISTINCT btrim(c)) INTO v_cities
    FROM unnest(p_city_ibges) c
   WHERE btrim(c) <> '';
  IF v_cities IS NULL AND v_city IS NOT NULL THEN
    v_cities := ARRAY[v_city];
  END IF;
  -- o IBGE já identifica a UF: com cidade(s) definida(s) o filtro de estado sairia redundante — e
  -- barraria irmãs de estados diferentes.
  IF v_cities IS NOT NULL THEN
    v_state := NULL;
  END IF;
  v_has_loc := (v_state IS NOT NULL OR v_cities IS NOT NULL);

  IF p_tags IS NOT NULL AND jsonb_typeof(p_tags) = 'array' THEN
    SELECT array_agg(DISTINCT lower(btrim(t))) INTO v_tags
      FROM jsonb_array_elements_text(p_tags) t
     WHERE btrim(t) <> '';
  END IF;
  IF v_tags IS NOT NULL THEN
    -- mesmo predicado do índice parcial `services_extras_tags` (plugin services 0011)
    v_tag_ids := ARRAY(
      SELECT st.id
        FROM public.services st
       WHERE st.active
         AND st.status = 'active'
         AND (st.extras -> 'tags') ?| v_tags
    );
  END IF;

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
      c.slug::character varying            AS category_slug,
      COALESCE(cgs.slug, cgc.slug)::character varying AS category_group_slug,
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
      -- só com irmãs: o anúncio é da cidade selecionada? (mesma regra do filtro de local abaixo)
      (
        cardinality(v_cities) > 1
        AND v_city IS NOT NULL
        AND (
          EXISTS (
            SELECT 1 FROM public.service_addresses ah
            WHERE ah.service_id = s.id AND ah.active AND ah.city_ibge = v_city
          )
          OR (
            NOT EXISTS (
              SELECT 1 FROM public.service_addresses ah0
              WHERE ah0.service_id = s.id AND ah0.active
            )
            AND prov.prov_city_ibge = v_city
          )
        )
      ) IS TRUE                            AS in_home_city,
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
    LEFT JOIN public.categories_group cgs ON cgs.id = s.category_group_id
    LEFT JOIN public.categories_group cgc ON cgc.id = c.category_group_id
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
      AND (v_tag_ids IS NULL OR s.id = ANY(v_tag_ids))
      AND (
        p_category_ids IS NULL
        OR cardinality(p_category_ids) = 0
        OR s.category_id = ANY(p_category_ids)
      )
      AND (
        p_category_id IS NOT NULL
        OR (p_category_ids IS NOT NULL AND cardinality(p_category_ids) > 0)
        OR p_exclude_category_slugs IS NULL
        OR c.slug IS NULL
        OR c.slug <> ALL(p_exclude_category_slugs)
      )
      AND (
        v_group_id IS NULL
        OR s.category_group_id = v_group_id
        -- grupo principal da categoria: anúncio sem grupo gravado (ou com um grupo antigo, de
        -- antes de a categoria mudar de grupo) continua aparecendo no grupo da categoria dele
        OR c.category_group_id = v_group_id
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
            AND (v_cities IS NULL OR a.city_ibge = ANY(v_cities))
        )
        OR (
          NOT EXISTS (
            SELECT 1 FROM public.service_addresses a0
            WHERE a0.service_id = s.id AND a0.active
          )
          AND (v_state IS NULL OR prov.prov_state = v_state)
          AND (v_cities IS NULL OR prov.prov_city_ibge = ANY(v_cities))
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
        f.in_home_city DESC,
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
    pg.category_slug::character varying,
    pg.category_group_slug::character varying,
    pg.subcategory::character varying,
    pg.sponsored,
    pg.cover_file_id::character varying,
    pg.provider_name::character varying,
    pg.provider_avatar::character varying,
    pg.rating::numeric,
    pg.reviews::integer,
    COALESCE(ad.a_city, pg.provider_city)::text,
    COALESCE(ad.a_state, pg.provider_state)::text,
    COALESCE(ad.cnt, 0)::integer,
    ev.event_start,
    ad.a_label::character varying
  FROM page pg
  LEFT JOIN LATERAL (
    SELECT NULLIF(fr.answers->>'data_inicio', '')::character varying AS event_start
    FROM public.form_results fr
    WHERE fr.domain = 'service'
      AND fr.reference_id = pg.service_id::text
    LIMIT 1
  ) ev ON true
  LEFT JOIN LATERAL (
    SELECT a.city AS a_city, a.state AS a_state, a.label AS a_label, count(*) OVER () AS cnt
    FROM public.service_addresses a
    WHERE a.service_id = pg.service_id
      AND a.active
    ORDER BY
      (v_has_loc
       AND (v_state IS NULL OR a.state = v_state)
       AND (v_cities IS NULL OR a.city_ibge = ANY(v_cities))) DESC,
      (a.city_ibge IS NOT DISTINCT FROM v_city) DESC,
      a.is_primary DESC,
      a.id
    LIMIT 1
  ) ad ON true
  ORDER BY pg.rn;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_search_services(character varying, integer, character varying, bigint, jsonb, text, double precision, integer, integer, text, text[], text[], bigint[], jsonb)
  TO anon, auth_user;

INSERT INTO auth.plugin_registry (name, version)
VALUES ('search', '1.7.0')
ON CONFLICT (name) DO UPDATE SET version = EXCLUDED.version;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Resultado (veja no psql): o índice UNIQUE do código só existe se não havia código repetido.
SELECT CASE WHEN to_regclass('public.services_extras_codigo_uniq') IS NOT NULL
            THEN 'OK: services_extras_codigo_uniq existe'
            ELSE 'ATENCAO: services_extras_codigo_uniq NAO existe (veja o WARNING acima; corrija os codigos repetidos e rode este arquivo de novo)'
       END AS indice_unico_codigo;
