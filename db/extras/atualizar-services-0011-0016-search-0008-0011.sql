-- Gerado de kizuna-core/plugins: services 0011-0016 (1.5.0 -> 1.10.0) e search 0008-0011 (1.6.0 -> 1.10.0).
-- services antes de search (search 0009 usa o índice da services 0014; a 0011 usa services.occurs_at).
-- Tudo numa transação: se algo falhar, nada fica aplicado.
BEGIN;

-- ===== kizuna-core/plugins/services/0011_services_tags_index.sql =====
-- plugins/services/0011_services_tags_index.sql
-- Tags genéricas do anúncio: `services.extras.tags` = array JSON de strings, minúsculas, em
-- kebab-case, com `:` separando um prefixo quando houver (ex.: `["casas-de-festas",
-- "local:espaco-x"]`). Servem para agrupar anúncios além da taxonomia (um local e os eventos dele,
-- um shopping e as lojas...). Filtro: `fn_search_services(p_tags => ...)` (plugin search 0008).
--
-- Só índice: nenhuma constraint (linhas antigas com `extras.tags` ausente ou fora do padrão
-- continuam válidas) e nenhum dado alterado.
--
-- GIN `jsonb_ops` (o padrão; `jsonb_path_ops` não atende `?|`) sobre `extras->'tags'`, PARCIAL nos
-- anúncios publicados (`active AND status = 'active'`): é o único conjunto que a busca lê, e a
-- pré-seleção por tag da RPC repete exatamente esse predicado, então o planner pode usá-lo.
--
-- Código do anúncio: `services.extras.codigo` = string (ex.: `espaco-art-festas-e-eventos`). Outros
-- anúncios o referenciam em `extras.tags`; a tela de detalhe usa isso nos dois sentidos (quem
-- organiza / quem está vinculado). Consulta: `extras->>codigo = <tag>` entre anúncios publicados;
-- btree parcial sobre a expressão, só nas linhas que têm `codigo` (a igualdade implica
-- `IS NOT NULL`, então o planner usa o índice). Este índice NÃO é único; a unicidade global do
-- código (entre anúncios não arquivados) vem da migração 0012 (`services_extras_codigo_uniq`).
-- Idempotente: IF NOT EXISTS.

CREATE INDEX IF NOT EXISTS services_extras_tags
  ON public.services USING gin ((extras -> 'tags'))
  WHERE active AND status = 'active';

CREATE INDEX IF NOT EXISTS services_extras_codigo
  ON public.services ((extras ->> 'codigo'))
  WHERE active AND status = 'active' AND (extras ->> 'codigo') IS NOT NULL;

INSERT INTO auth.plugin_registry (name, version)
VALUES ('services', '1.6.0')
ON CONFLICT (name) DO UPDATE SET version = EXCLUDED.version;

-- ===== kizuna-core/plugins/services/0012_services_links_guard.sql =====
-- plugins/services/0012_services_links_guard.sql
-- Código e vínculos do anúncio: `services.extras.codigo`, `extras.tags` e `extras.vinculosTitulo`.
-- Quem pode escrever: só quem tem a permissão `services.link` (root passa por padrão; a permissão
-- não é concedida a nenhum papel aqui — o dono concede depois pelo RBAC). Sessões de sistema
-- (importação/robô como superusuário, sem JWT) passam.
--
-- Aditivo e idempotente:
--   1) permissão `services.link` em auth.permissions;
--   2) função + trigger BEFORE INSERT OR UPDATE OF extras em public.services:
--      a) VALIDAÇÃO (para todos, inclusive root e sistema), só do valor que mudou:
--         codigo ^[a-z0-9][a-z0-9._-]{0,59}$; tags = array de até 10 strings
--         ^[a-z0-9][a-z0-9:._-]{0,59}$; vinculosTitulo = string de até 60 caracteres → 22023;
--      b) PERMISSÃO: se alguma das três chaves mudou (ausente, null, '' e [] contam como vazio),
--         exige `services.link` ou sessão de sistema → senão 42501. Reenviar os mesmos valores
--         (read-merge-write do wizard) e editar outras colunas/chaves passa;
--   3) índice UNIQUE parcial GLOBAL de `extras->>'codigo'` entre anúncios ativos e não arquivados,
--      criado só se não houver duplicata (senão WARNING e segue, sem abortar a migração; depois de
--      corrigir é preciso executar este arquivo de novo, `db migrate` não o reexecuta).
-- Sessão de sistema = sem `user_id` no JWT e papel diferente de `anon`/`auth_user` (superusuário do
-- importador, jobs SECURITY DEFINER, service_role). `anon`/`auth_user` sem usuário NÃO passam.

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


-- ===== kizuna-core/plugins/services/0013_services_category_stats_subcategories_groups.sql =====
-- plugins/services/0013_services_category_stats_subcategories_groups.sql
-- `vw_category_service_stats` ganha 3 colunas AO FINAL (mesmo grão: 1 linha por categoria com
-- anúncio publicado e não vencido) para o filtro da busca esconder o que está vazio sem outra fonte:
--   subcategory_ids   → subcategorias (service_categories_sub) com ao menos 1 anúncio vivo
--   category_group_id → grupo primário da categoria
--   group_ids         → grupo primário + vínculos extras (categories_group_link), só grupos ativos
-- As 3 colunas antigas ficam idênticas (carrossel e demais consumidores não mudam).
--
-- Idempotente: CREATE OR REPLACE VIEW (só acrescenta colunas no fim, permitido pelo Postgres).
-- Reverter: reaplicar plugins/services/0010_services_category_stats_not_expired.sql.

CREATE OR REPLACE VIEW public.vw_category_service_stats
WITH (security_invoker = true) AS
SELECT
  c.id                  AS category_id,
  c.name                AS category_name,
  count(s.id)::int      AS services_count,
  COALESCE((
    SELECT array_agg(DISTINCT scs.category_sub_id)
    FROM public.service_categories_sub scs
    JOIN public.services s2
      ON s2.id = scs.service_id
     AND s2.active = true
     AND s2.status = 'active'
     AND (s2.expires_at IS NULL OR s2.expires_at > now())
    WHERE scs.active = true
      AND scs.category_id = c.id
  ), '{}'::bigint[])    AS subcategory_ids,
  c.category_group_id   AS category_group_id,
  COALESCE((
    SELECT array_agg(DISTINCT x.gid)
    FROM (
      SELECT c.category_group_id AS gid
      UNION
      SELECT l.category_group_id
      FROM public.categories_group_link l
      WHERE l.category_id = c.id
    ) x
    JOIN public.categories_group g ON g.id = x.gid AND g.active = true
    WHERE x.gid IS NOT NULL
  ), '{}'::bigint[])    AS group_ids
FROM public.categories c
JOIN public.services s
  ON s.category_id = c.id
 AND s.active = true
 AND s.status = 'active'
 AND (s.expires_at IS NULL OR s.expires_at > now())
WHERE c.active = true
GROUP BY c.id, c.name, c.category_group_id;

GRANT SELECT ON public.vw_category_service_stats TO anon, auth_user;

INSERT INTO auth.plugin_registry (name, version)
VALUES ('services', '1.8.0')
ON CONFLICT (name) DO UPDATE SET version = EXCLUDED.version;


-- ===== kizuna-core/plugins/services/0014_services_local_ref_index.sql =====
-- plugins/services/0014_services_local_ref_index.sql
-- Referência a outro anúncio: `services.extras.local_ref` = uid ou `extras.codigo` do lugar onde o
-- evento acontece. Basta esse campo para ligar os dois sentidos: o evento mostra "Onde acontece" e a
-- página do lugar lista o evento nos vinculados (`fn_search_services(p_local_refs => ...)`, plugin
-- search 0009). A tag com o código do lugar continua aceita, mas é opcional.
--
-- Só índice: btree parcial sobre a expressão, só nos anúncios publicados que têm `local_ref` (a
-- igualdade implica `IS NOT NULL`, então o planner usa o índice). Nenhum dado alterado.
-- Idempotente: IF NOT EXISTS.

CREATE INDEX IF NOT EXISTS services_extras_local_ref
  ON public.services ((extras ->> 'local_ref'))
  WHERE active AND status = 'active' AND (extras ->> 'local_ref') IS NOT NULL;

INSERT INTO auth.plugin_registry (name, version)
VALUES ('services', '1.9.0')
ON CONFLICT (name) DO UPDATE SET version = EXCLUDED.version;


-- ===== kizuna-core/plugins/services/0015_services_moderation_guard.sql =====
-- plugins/services/0015_services_moderation_guard.sql
-- Fecha a autopublicação: o GRANT de UPDATE em public.services é da tabela inteira e as policies só
-- conferem `created_by`, então o dono podia gravar `status = 'active'` e `sponsored = true` direto
-- (pela rota de recursos ou pelo PostgREST) e pular `fn_service_moderate`.
--
-- Trigger BEFORE INSERT OR UPDATE, para quem NÃO tem `services.moderate` e não é sessão de sistema:
--   INSERT: status vira 'pending' e sponsored vira false;
--   UPDATE: status só pode voltar para 'pending' (reenviar para moderação); qualquer outra troca
--           mantém o valor antigo. sponsored e tenant_id mantêm o valor antigo.
-- Silencioso (não dá erro) porque o wizard faz read-merge-write e reenvia esses campos.
-- `fn_service_moderate` é SECURITY DEFINER, mas o JWT do moderador continua na requisição, então
-- passa pela checagem de permissão. Sessão de sistema = mesma regra do 0012 (sem `user_id` no JWT e
-- papel diferente de anon/auth_user: importador, jobs, service_role).
-- Aditivo e idempotente.

CREATE OR REPLACE FUNCTION public.fn_services_moderation_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, auth
AS $function$
DECLARE
  v_claims text := nullif(current_setting('request.jwt.claims', true), '');
  v_uid    text;
BEGIN
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

  IF auth.fun_auth_has_perm('services', 'moderate') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.status := 'pending';
    NEW.sponsored := false;
  ELSE
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'pending' THEN
      NEW.status := OLD.status;
    END IF;
    NEW.sponsored := OLD.sponsored;
    NEW.tenant_id := OLD.tenant_id;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_services_moderation_guard ON public.services;
CREATE TRIGGER trg_services_moderation_guard
  BEFORE INSERT OR UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.fn_services_moderation_guard();

-- ===== kizuna-core/plugins/services/0016_services_occurs_at.sql =====
-- plugins/services/0016_services_occurs_at.sql
-- `services.occurs_at`: QUANDO o anúncio acontece (evento: data/hora de início). Genérico — vale
-- para qualquer categoria que tenha data (show, feira, curso…); NULL = sem data. Existe para
-- ORDENAR e filtrar por data com índice, sem abrir o JSON do formulário a cada busca
-- (`fn_search_services` `p_order => 'occurs_at'`, plugin search 0011).
--
-- Fonte: quem grava o anúncio pode preencher direto (importador/robô). Além disso, o trigger em
-- `form_results` (plugin forms) copia a resposta de data do formulário do anúncio — a primeira
-- chave preenchida de `answers` entre `data_inicio`, `data_evento`, `data` — para `occurs_at`.
-- Data sem fuso (`2026-10-25T19:00`, campo datetime do form) é lida no horário de Brasília.
-- Texto que não é data é ignorado (não derruba o save do formulário).
-- Idempotente.

ALTER TABLE public.services ADD COLUMN IF NOT EXISTS occurs_at timestamptz NULL;

COMMENT ON COLUMN public.services.occurs_at IS
  'Quando o anúncio acontece (evento: início). NULL = sem data. Ordenação/agenda; sincronizado de form_results.answers.data_inicio.';

-- Só anúncios publicados com data: é o recorte que a busca ordena.
CREATE INDEX IF NOT EXISTS services_occurs_at
  ON public.services (occurs_at)
  WHERE active AND status = 'active' AND occurs_at IS NOT NULL;

-- Texto de data (ISO, com ou sem fuso) → timestamptz; inválido/vazio → NULL.
CREATE OR REPLACE FUNCTION public.fn_parse_occurs_at(p_value text)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $function$
DECLARE
  v text := NULLIF(btrim(p_value), '');
BEGIN
  IF v IS NULL THEN
    RETURN NULL;
  END IF;
  -- com fuso explícito (Z ou ±hh:mm) vale como veio; sem fuso = horário de Brasília
  -- (o fuso só conta depois da hora: '2026-10-25' termina em '-25', que não é fuso)
  IF v ~ '[T ]\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}(:?\d{2})?)$' THEN
    RETURN v::timestamptz;
  END IF;
  RETURN (v::timestamp) AT TIME ZONE 'America/Sao_Paulo';
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$function$;

DO $do$
BEGIN
  -- O sincronismo depende do plugin forms (vem antes de services na lista); sem ele, só a coluna.
  IF to_regclass('public.form_results') IS NULL THEN
    RETURN;
  END IF;

  CREATE OR REPLACE FUNCTION public.fn_form_results_sync_occurs_at()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $function$
  DECLARE
    v_at timestamptz;
  BEGIN
    IF NEW.domain <> 'service' OR NEW.reference_id IS NULL OR NEW.reference_id !~ '^\d+$' THEN
      RETURN NEW;
    END IF;
    v_at := public.fn_parse_occurs_at(
      COALESCE(
        NULLIF(NEW.answers->>'data_inicio', ''),
        NULLIF(NEW.answers->>'data_evento', ''),
        NULLIF(NEW.answers->>'data', '')
      )
    );
    UPDATE public.services s
       SET occurs_at = v_at
     WHERE s.id = NEW.reference_id::bigint
       AND s.occurs_at IS DISTINCT FROM v_at;
    RETURN NEW;
  END;
  $function$;

  DROP TRIGGER IF EXISTS trg_form_results_sync_occurs_at ON public.form_results;
  CREATE TRIGGER trg_form_results_sync_occurs_at
    AFTER INSERT OR UPDATE OF answers, reference_id, domain ON public.form_results
    FOR EACH ROW EXECUTE FUNCTION public.fn_form_results_sync_occurs_at();

  -- Backfill dos anúncios que já têm formulário com data.
  UPDATE public.services s
     SET occurs_at = x.at
    FROM (
      SELECT DISTINCT ON (fr.reference_id)
             fr.reference_id::bigint AS service_id,
             public.fn_parse_occurs_at(
               COALESCE(
                 NULLIF(fr.answers->>'data_inicio', ''),
                 NULLIF(fr.answers->>'data_evento', ''),
                 NULLIF(fr.answers->>'data', '')
               )
             ) AS at
        FROM public.form_results fr
       WHERE fr.domain = 'service'
         AND fr.reference_id ~ '^\d+$'
       ORDER BY fr.reference_id, fr.id DESC
    ) x
   WHERE s.id = x.service_id
     AND x.at IS NOT NULL
     AND s.occurs_at IS DISTINCT FROM x.at;
END;
$do$;

INSERT INTO auth.plugin_registry (name, version)
VALUES ('services', '1.10.0')
ON CONFLICT (name) DO UPDATE SET version = EXCLUDED.version;


-- ===== kizuna-core/plugins/search/0008_search_tags.sql =====
-- plugins/search/0008_search_tags.sql
-- `fn_search_services` ganha `p_tags jsonb` (último parâmetro): lista de tags de
-- `services.extras.tags` (convenção e índice GIN: plugin services 0011). Semântica ANY: o anúncio
-- entra se tiver PELO MENOS UMA das tags. `NULL`, `[]`, valor que não é array ou só strings vazias
-- = sem filtro. As tags pedidas são normalizadas (`btrim` + minúsculas); as gravadas não.
-- O filtro é uma pré-seleção de ids (`?|` sobre `extras->'tags'`, com o mesmo predicado do índice
-- parcial), fora do `OR` com o parâmetro nulo — assim o índice serve também ao plano genérico do
-- PL/pgSQL. Retorno, ordenação, `SECURITY DEFINER` e demais parâmetros idênticos aos da 0007.
-- A assinatura muda (14 parâmetros): `DROP FUNCTION` da anterior (13), `CREATE` da nova e o mesmo
-- `GRANT`. Chamadas antigas (por nome, sem `p_tags`) continuam valendo pelo DEFAULT.
-- Idempotente: o DROP é IF EXISTS e o CREATE é OR REPLACE.

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


-- ===== kizuna-core/plugins/search/0009_search_local_refs.sql =====
-- plugins/search/0009_search_local_refs.sql
-- `fn_search_services` ganha `p_local_refs jsonb` (último parâmetro): valores de
-- `local_ref` (uid ou código de outro anúncio — o lugar onde o evento acontece), lido de
-- `services.extras.local_ref` OU de `form_results.answers.local_ref` (formulário do evento). A
-- página de detalhe do lugar lista os vinculados numa chamada só: `p_tags => [codigo]` +
-- `p_local_refs => [uid, codigo]`. Com os dois, a pré-seleção é a UNIÃO (tem a tag OU aponta pelo
-- local_ref); com um só, só ele. `NULL`, `[]`, não-array ou só vazias = sem esse filtro. Os valores
-- pedidos são aparados (`btrim`); a comparação é exata (uid e código já são minúsculos).
-- Índices: btree parcial `services_extras_local_ref` (plugin services 0014) e o GIN de
-- `form_results.answers` (plugin forms 0001).
-- Retorno, ordenação, `SECURITY DEFINER` e demais parâmetros idênticos aos da 0008.
-- A assinatura muda (15 parâmetros): `DROP FUNCTION` da anterior (14), `CREATE` da nova e o mesmo
-- `GRANT`. Chamadas antigas (por nome, sem `p_local_refs`) continuam valendo pelo DEFAULT.
-- Idempotente: o DROP é IF EXISTS e o CREATE é OR REPLACE.

DROP FUNCTION IF EXISTS public.fn_search_services(character varying, integer, character varying, bigint, jsonb, text, double precision, integer, integer, text, text[], text[], bigint[], jsonb);

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
  p_tags jsonb DEFAULT NULL::jsonb,
  p_local_refs jsonb DEFAULT NULL::jsonb
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
  -- valores de `extras.local_ref` pedidos (aparados, sem vazios); NULL = sem esse filtro
  v_refs text[];
  -- anúncios publicados com alguma das tags OU com local_ref pedido; NULL = sem filtro
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
  IF p_local_refs IS NOT NULL AND jsonb_typeof(p_local_refs) = 'array' THEN
    SELECT array_agg(DISTINCT btrim(r)) INTO v_refs
      FROM jsonb_array_elements_text(p_local_refs) r
     WHERE btrim(r) <> '';
  END IF;
  IF v_tags IS NOT NULL OR v_refs IS NOT NULL THEN
    -- mesmos predicados dos índices parciais `services_extras_tags` (services 0011) e
    -- `services_extras_local_ref` (services 0014); UNION para cada ramo usar o seu índice
    v_tag_ids := ARRAY(
      SELECT st.id
        FROM public.services st
       WHERE v_tags IS NOT NULL
         AND st.active
         AND st.status = 'active'
         AND (st.extras -> 'tags') ?| v_tags
      UNION
      SELECT sr.id
        FROM public.services sr
       WHERE v_refs IS NOT NULL
         AND sr.active
         AND sr.status = 'active'
         AND (sr.extras ->> 'local_ref') = ANY(v_refs)
      UNION
      -- o formulário do evento (plugin forms) grava o campo em `form_results.answers.local_ref`;
      -- `@>` por valor usa o GIN `form_results_answers_gin` (jsonb_path_ops)
      SELECT sf.id
        FROM unnest(v_refs) ref
        JOIN public.form_results fr
          ON fr.domain = 'service'
         AND fr.answers @> jsonb_build_object('local_ref', ref)
        JOIN public.services sf
          ON sf.id::text = fr.reference_id
       WHERE sf.active
         AND sf.status = 'active'
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

GRANT EXECUTE ON FUNCTION public.fn_search_services(character varying, integer, character varying, bigint, jsonb, text, double precision, integer, integer, text, text[], text[], bigint[], jsonb, jsonb)
  TO anon, auth_user;

INSERT INTO auth.plugin_registry (name, version)
VALUES ('search', '1.8.0')
ON CONFLICT (name) DO UPDATE SET version = EXCLUDED.version;


-- ===== kizuna-core/plugins/search/0010_search_order.sql =====
-- plugins/search/0010_search_order.sql
-- `fn_search_services` ganha `p_order text` (último parâmetro): ordenação dos resultados.
--   NULL / 'relevance' / desconhecido = ordem de sempre (texto, cidade, avaliação, aleatório)
--   'event_start' = próximos eventos primeiro (`form_results.answers.data_inicio`, ISO), depois os
--                   já passados e por fim os sem data
--   'recent'      = publicados mais recentemente primeiro (`services.created_at`)
--   'title'       = alfabética
-- A busca de texto continua mandando primeiro (`text_rank`); o critério pedido vem logo depois.
-- `event_start` passa a ser calculado no CTE filtrado (antes da página) para poder ordenar.
-- Usado pela /busca via `search.orderByGroup` do kizuna.config.json.
-- A assinatura muda (16 parâmetros): `DROP FUNCTION` da anterior (15), `CREATE` da nova e o mesmo
-- `GRANT`. Chamadas antigas (por nome, sem `p_order`) continuam valendo pelo DEFAULT.
-- Idempotente: o DROP é IF EXISTS e o CREATE é OR REPLACE.

DROP FUNCTION IF EXISTS public.fn_search_services(character varying, integer, character varying, bigint, jsonb, text, double precision, integer, integer, text, text[], text[], bigint[], jsonb, jsonb);

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
  p_tags jsonb DEFAULT NULL::jsonb,
  p_local_refs jsonb DEFAULT NULL::jsonb,
  p_order text DEFAULT NULL::text
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
  -- valores de `extras.local_ref` pedidos (aparados, sem vazios); NULL = sem esse filtro
  v_refs text[];
  -- anúncios publicados com alguma das tags OU com local_ref pedido; NULL = sem filtro
  v_tag_ids bigint[];
  -- ordenação pedida; desconhecida/NULL = relevância (a ordem de sempre)
  v_order text := CASE WHEN p_order IN ('event_start', 'recent', 'title') THEN p_order END;
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
  IF p_local_refs IS NOT NULL AND jsonb_typeof(p_local_refs) = 'array' THEN
    SELECT array_agg(DISTINCT btrim(r)) INTO v_refs
      FROM jsonb_array_elements_text(p_local_refs) r
     WHERE btrim(r) <> '';
  END IF;
  IF v_tags IS NOT NULL OR v_refs IS NOT NULL THEN
    -- mesmos predicados dos índices parciais `services_extras_tags` (services 0011) e
    -- `services_extras_local_ref` (services 0014); UNION para cada ramo usar o seu índice
    v_tag_ids := ARRAY(
      SELECT st.id
        FROM public.services st
       WHERE v_tags IS NOT NULL
         AND st.active
         AND st.status = 'active'
         AND (st.extras -> 'tags') ?| v_tags
      UNION
      SELECT sr.id
        FROM public.services sr
       WHERE v_refs IS NOT NULL
         AND sr.active
         AND sr.status = 'active'
         AND (sr.extras ->> 'local_ref') = ANY(v_refs)
      UNION
      -- o formulário do evento (plugin forms) grava o campo em `form_results.answers.local_ref`;
      -- `@>` por valor usa o GIN `form_results_answers_gin` (jsonb_path_ops)
      SELECT sf.id
        FROM unnest(v_refs) ref
        JOIN public.form_results fr
          ON fr.domain = 'service'
         AND fr.answers @> jsonb_build_object('local_ref', ref)
        JOIN public.services sf
          ON sf.id::text = fr.reference_id
       WHERE sf.active
         AND sf.status = 'active'
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
      END AS text_rank,
      s.created_at                         AS created_at,
      ev.event_start                       AS event_start
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
    LEFT JOIN LATERAL (
      SELECT NULLIF(fr.answers->>'data_inicio', '')::character varying AS event_start
      FROM public.form_results fr
      WHERE fr.domain = 'service'
        AND fr.reference_id = s.id::text
      LIMIT 1
    ) ev ON true
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
        -- p_order='event_start': próximos eventos primeiro (data ISO; hoje em diante, do mais
        -- próximo ao mais distante), depois os já passados e por fim os sem data
        CASE WHEN v_order = 'event_start' THEN (f.event_start >= to_char(current_date, 'YYYY-MM-DD')) END DESC NULLS LAST,
        CASE WHEN v_order = 'event_start' THEN f.event_start END ASC NULLS LAST,
        CASE WHEN v_order = 'recent' THEN f.created_at END DESC NULLS LAST,
        CASE WHEN v_order = 'title' THEN f.title END ASC,
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
    pg.event_start,
    ad.a_label::character varying
  FROM page pg
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

GRANT EXECUTE ON FUNCTION public.fn_search_services(character varying, integer, character varying, bigint, jsonb, text, double precision, integer, integer, text, text[], text[], bigint[], jsonb, jsonb, text)
  TO anon, auth_user;

INSERT INTO auth.plugin_registry (name, version)
VALUES ('search', '1.9.0')
ON CONFLICT (name) DO UPDATE SET version = EXCLUDED.version;


-- ===== kizuna-core/plugins/search/0011_search_order_fields.sql =====
-- plugins/search/0011_search_order_fields.sql
-- `p_order` passa a ser '<campo>[:asc|desc]' (padrão asc) sobre colunas de `services`, de uma lista
-- fechada — indexáveis, sem abrir o JSON do formulário para ordenar:
--   occurs_at  (services 0016: quando acontece; asc = o que vem primeiro, passados depois)
--   created_at | expires_at | price (starting_price) | title
-- Apelidos da 0010 continuam: event_start = occurs_at:asc, recent = created_at:desc.
-- NULL / vazio / desconhecido = relevância (ordem de sempre). Com texto, `text_rank` vem antes.
-- Performance: a 0010 lia `form_results` (JSON) para CADA linha filtrada só para ordenar; aqui o
-- `event_start` exibido volta a ser lido só para as linhas da página.
-- Assinatura igual à 0010 (16 parâmetros): só `CREATE OR REPLACE`. Requer services 0016.
-- Idempotente.

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
  p_tags jsonb DEFAULT NULL::jsonb,
  p_local_refs jsonb DEFAULT NULL::jsonb,
  p_order text DEFAULT NULL::text
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
  -- valores de `extras.local_ref` pedidos (aparados, sem vazios); NULL = sem esse filtro
  v_refs text[];
  -- anúncios publicados com alguma das tags OU com local_ref pedido; NULL = sem filtro
  v_tag_ids bigint[];
  -- `p_order` = '<campo>[:asc|desc]' de uma lista fechada (colunas de services, nada de JSON);
  -- apelidos da 0010: event_start = occurs_at:asc, recent = created_at:desc
  v_order text := lower(btrim(COALESCE(p_order, '')));
  v_field text;
  v_desc  boolean;
BEGIN
  v_order := CASE v_order
    WHEN 'event_start' THEN 'occurs_at:asc'
    WHEN 'recent' THEN 'created_at:desc'
    ELSE v_order
  END;
  v_field := split_part(v_order, ':', 1);
  v_desc := split_part(v_order, ':', 2) = 'desc';
  IF v_field NOT IN ('occurs_at', 'created_at', 'expires_at', 'price', 'title') THEN
    v_field := NULL; -- relevância (a ordem de sempre)
  END IF;
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
  IF p_local_refs IS NOT NULL AND jsonb_typeof(p_local_refs) = 'array' THEN
    SELECT array_agg(DISTINCT btrim(r)) INTO v_refs
      FROM jsonb_array_elements_text(p_local_refs) r
     WHERE btrim(r) <> '';
  END IF;
  IF v_tags IS NOT NULL OR v_refs IS NOT NULL THEN
    -- mesmos predicados dos índices parciais `services_extras_tags` (services 0011) e
    -- `services_extras_local_ref` (services 0014); UNION para cada ramo usar o seu índice
    v_tag_ids := ARRAY(
      SELECT st.id
        FROM public.services st
       WHERE v_tags IS NOT NULL
         AND st.active
         AND st.status = 'active'
         AND (st.extras -> 'tags') ?| v_tags
      UNION
      SELECT sr.id
        FROM public.services sr
       WHERE v_refs IS NOT NULL
         AND sr.active
         AND sr.status = 'active'
         AND (sr.extras ->> 'local_ref') = ANY(v_refs)
      UNION
      -- o formulário do evento (plugin forms) grava o campo em `form_results.answers.local_ref`;
      -- `@>` por valor usa o GIN `form_results_answers_gin` (jsonb_path_ops)
      SELECT sf.id
        FROM unnest(v_refs) ref
        JOIN public.form_results fr
          ON fr.domain = 'service'
         AND fr.answers @> jsonb_build_object('local_ref', ref)
        JOIN public.services sf
          ON sf.id::text = fr.reference_id
       WHERE sf.active
         AND sf.status = 'active'
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
      END AS text_rank,
      s.created_at                         AS created_at,
      s.occurs_at                          AS occurs_at,
      s.expires_at                         AS expires_at,
      s.starting_price::numeric            AS sort_price
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
        -- occurs_at crescente: o que ainda vai acontecer primeiro (do mais próximo ao mais
        -- distante), depois o que já passou; sem data por último
        CASE WHEN v_field = 'occurs_at' AND NOT v_desc THEN (f.occurs_at >= now()) END DESC NULLS LAST,
        CASE WHEN v_field = 'occurs_at' AND NOT v_desc THEN f.occurs_at END ASC NULLS LAST,
        CASE WHEN v_field = 'occurs_at' AND v_desc THEN f.occurs_at END DESC NULLS LAST,
        CASE WHEN v_field = 'created_at' AND NOT v_desc THEN f.created_at END ASC NULLS LAST,
        CASE WHEN v_field = 'created_at' AND v_desc THEN f.created_at END DESC NULLS LAST,
        CASE WHEN v_field = 'expires_at' AND NOT v_desc THEN f.expires_at END ASC NULLS LAST,
        CASE WHEN v_field = 'expires_at' AND v_desc THEN f.expires_at END DESC NULLS LAST,
        CASE WHEN v_field = 'price' AND NOT v_desc THEN f.sort_price END ASC NULLS LAST,
        CASE WHEN v_field = 'price' AND v_desc THEN f.sort_price END DESC NULLS LAST,
        CASE WHEN v_field = 'title' AND NOT v_desc THEN f.title END ASC,
        CASE WHEN v_field = 'title' AND v_desc THEN f.title END DESC,
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

GRANT EXECUTE ON FUNCTION public.fn_search_services(character varying, integer, character varying, bigint, jsonb, text, double precision, integer, integer, text, text[], text[], bigint[], jsonb, jsonb, text)
  TO anon, auth_user;

INSERT INTO auth.plugin_registry (name, version)
VALUES ('search', '1.10.0')
ON CONFLICT (name) DO UPDATE SET version = EXCLUDED.version;


COMMIT;
NOTIFY pgrst, 'reload schema';
