-- db/extras/eventos_acontece_em_aplicar.sql
-- "Acontece em" dos eventos (services.expires_at) + vencidos recentes na busca. Rode UMA vez, inteiro:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/extras/eventos_acontece_em_aplicar.sql
--   (ou cole/execute o arquivo inteiro como script no seu cliente SQL; se um passo falhar, o erro REAL é o primeiro da lista, os "25P02" depois dele são só consequência)
-- Compilado de, nesta ordem (cada parte em sua transação):
--   1) kizuna-core/plugins/search/0013_search_expires_at.sql   (busca: expires_at, p_expired_grace, event_start)
--   2) db/extras/pendentes_forms_eventos.sql                   (formulário de eventos sem as datas)
--   3) db/extras/eventos_expires_at_backfill.sql               (preenche expires_at dos eventos existentes)
-- Idempotente. Para ver o que o passo 3 vai mudar ANTES, rode a "Prévia" que está no fim do backfill.

BEGIN;
-- plugins/search/0013_search_expires_at.sql
-- `fn_search_services` passa a devolver `expires_at` (validade do anúncio, `services.expires_at`).
-- Nos eventos essa coluna é o "Acontece em" (data do evento, fim do dia no horário local do evento, Cuiabá em MT): o
-- card mostra a data a partir dela, em vez de abrir `form_results.answers.data_inicio`.
-- `event_start` continua sendo devolvido (RPCs/consumidores antigos), mas o card não depende mais dele.
--
-- O tipo de retorno muda (uma coluna a mais) e a assinatura ganha um 17º parâmetro, então não dá para
-- `CREATE OR REPLACE`: a função é recriada (DROP + CREATE) com os mesmos GRANTs. O DROP remove as DUAS
-- assinaturas (a de 16 parâmetros da 0011 e a de 17 desta migração, se já aplicada) para não sobrar
-- overload ambíguo no PostgREST. O resto do corpo é igual ao da 0011, com estas diferenças:
--   (1) devolve `expires_at`;
--   (2) `event_start` cai no dia do `expires_at` quando o formulário não tem `data_inicio`, e o apelido
--       `p_order => 'event_start'` ordena por `expires_at:asc` (a data do evento passou a ser o
--       "Acontece em");
--   (3) novo `p_expired_grace jsonb` (padrão NULL): mapa `{ "<slug do grupo>": dias }`, ex. `{"eventos": 2}`.
--       Anúncio daquele grupo com `expires_at` vencido há no máximo N dias continua na busca (o
--       cliente o marca como "já aconteceu" pelo `expires_at` devolvido). Só valem dias inteiros de 1 a
--       365; qualquer outro valor (texto, negativo, decimal, objeto que não seja um mapa) conta 0 = o
--       comportamento de sempre (vencido some), sem erro. Sem a chave, nada muda.
--   (4) vencido vem SEMPRE depois do não vencido, em qualquer ordenação (inclusive relevância e busca
--       por texto); entre os vencidos, o que venceu há menos tempo primeiro.
-- Idempotente (DROP IF EXISTS).

DROP FUNCTION IF EXISTS public.fn_search_services(character varying, integer, character varying, bigint, jsonb, text, double precision, integer, integer, text, text[], text[], bigint[], jsonb, jsonb, text);
DROP FUNCTION IF EXISTS public.fn_search_services(character varying, integer, character varying, bigint, jsonb, text, double precision, integer, integer, text, text[], text[], bigint[], jsonb, jsonb, text, jsonb);

CREATE FUNCTION public.fn_search_services(
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
  p_order text DEFAULT NULL::text,
  p_expired_grace jsonb DEFAULT NULL::jsonb
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
  venue character varying,
  expires_at timestamptz
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
  -- apelidos: event_start = expires_at:asc (0013: o "Acontece em" do evento), recent = created_at:desc
  v_order text := lower(btrim(COALESCE(p_order, '')));
  v_field text;
  v_desc  boolean;
BEGIN
  v_order := CASE v_order
    WHEN 'event_start' THEN 'expires_at:asc'
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
      -- vencido (ainda aparece só se o grupo tem tolerância em `p_expired_grace`): vai ao fim da lista
      (s.expires_at IS NOT NULL AND s.expires_at <= now()) AS is_expired,
      s.starting_price::numeric            AS sort_price
    FROM public.services s
    LEFT JOIN public.categories c ON c.id = s.category_id
    LEFT JOIN public.categories_group cgs ON cgs.id = s.category_group_id
    LEFT JOIN public.categories_group cgc ON cgc.id = c.category_group_id
    -- dias de tolerância do grupo do anúncio (mesmo slug devolvido em `category_group_slug`):
    -- só inteiro de 1 a 365; o resto (ou sem mapa/sem o grupo) = 0. CASEs aninhados: o cast só roda
    -- depois de o regex passar, e nunca estoura.
    LEFT JOIN LATERAL (
      SELECT COALESCE(
        CASE WHEN jsonb_typeof(p_expired_grace) = 'object' THEN
          CASE WHEN (p_expired_grace ->> COALESCE(cgs.slug, cgc.slug)) ~ '^\d{1,3}$' THEN
            CASE WHEN (p_expired_grace ->> COALESCE(cgs.slug, cgc.slug))::integer BETWEEN 1 AND 365
                 THEN (p_expired_grace ->> COALESCE(cgs.slug, cgc.slug))::integer
            END
          END
        END,
        0
      ) AS days
    ) gr ON true
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
      AND (s.expires_at IS NULL OR s.expires_at > now() - make_interval(days => gr.days))
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
        -- vencidos (tolerância de `p_expired_grace`) sempre depois dos não vencidos; entre eles, o que
        -- venceu há menos tempo primeiro
        f.is_expired ASC,
        CASE WHEN f.is_expired THEN f.expires_at END DESC NULLS LAST,
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
    -- data de início do formulário (importador/legado); sem ela, o dia do "Acontece em" (expires_at,
    -- fuso de Cuiabá) quando o anúncio tem formulário — o formulário novo não pede mais data de início
    COALESCE(
      ev.event_start,
      CASE WHEN ev.has_form
           THEN to_char(pg.expires_at AT TIME ZONE 'America/Cuiaba', 'YYYY-MM-DD')
      END
    )::character varying,
    ad.a_label::character varying,
    pg.expires_at
  FROM page pg
  LEFT JOIN LATERAL (
    SELECT NULLIF(fr.answers->>'data_inicio', '')::character varying AS event_start, true AS has_form
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

GRANT EXECUTE ON FUNCTION public.fn_search_services(character varying, integer, character varying, bigint, jsonb, text, double precision, integer, integer, text, text[], text[], bigint[], jsonb, jsonb, text, jsonb)
  TO anon, auth_user;

INSERT INTO auth.plugin_registry (name, version)
VALUES ('search', '1.12.0')
ON CONFLICT (name) DO UPDATE SET version = EXCLUDED.version;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- db/extras/pendentes_forms_eventos.sql
--
-- Atualiza o formulario `eventos` de um banco existente para o schema de db/extras/forms_seed_eventos.sql
-- (sessoes, ingressos com setor/tipo/pessoas/lote/comprar e contato; endereco, local_ref e
-- pontos_de_venda sairam do formulario: ficam no passo de endereco do wizard; link_ingresso saiu), sem apagar
-- o formulario nem as respostas. As chaves antigas continuam iguais; as respostas ja gravadas seguem validas.
-- O trigger do plugin forms incrementa `version`. Opcoes acrescentadas pelo importador sao substituidas
-- pelas do seed (o importador as acrescenta de novo na proxima Fase 1).
-- Gerado a partir do seed: ao mudar o seed, regenere este arquivo (mesmo conteudo, sem o bloco 0).
-- Aplicar: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/extras/pendentes_forms_eventos.sql

BEGIN;


-- 1) Formulario -------------------------------------------------------------------------------------
INSERT INTO public.forms (tenant_id, form_key, title, description, schema, active, created_by)
SELECT t.uid, 'eventos', 'Eventos — detalhes e ingressos',
       'Horários, ingressos, onde comprar e contato do evento.', $schema$
{
  "title": "Eventos — detalhes e ingressos",
  "description": "Horários, ingressos, onde comprar e contato do evento.",
  "fields": [
    {
      "id": "evt_01_secao_evento", "key": "secao_evento", "name": "secao_evento", "type": "heading", "label": "Evento",
      "grid": { "xs": 12, "sm": 12, "md": 12, "lg": 12, "xl": 12, "2xl": 12 },
      "behavior": {}, "validation": {}, "appearance": {}
    },
    {
      "id": "evt_04_realizador", "key": "realizador", "name": "realizador", "type": "text", "label": "Realizador",
      "grid": { "xs": 12, "sm": 12, "md": 6, "lg": 6, "xl": 6, "2xl": 6 },
      "behavior": {}, "validation": {}, "appearance": {}, "placeholder": "Quem organiza o evento"
    },
    {
      "id": "evt_05_link", "key": "link", "name": "link", "type": "url", "label": "Link do evento",
      "grid": { "xs": 12, "sm": 12, "md": 6, "lg": 6, "xl": 6, "2xl": 6 },
      "behavior": {}, "validation": {}, "appearance": {}, "placeholder": "https://"
    },
    {
      "id": "evt_10_classificacao_indicativa", "key": "classificacao_indicativa", "name": "classificacao_indicativa", "type": "select", "label": "Classificação indicativa",
      "grid": { "xs": 12, "sm": 12, "md": 6, "lg": 6, "xl": 6, "2xl": 6 },
      "behavior": {}, "validation": {}, "appearance": {},
      "options": [
        { "label": "Livre", "value": "Livre" },
        { "label": "10 anos", "value": "10 anos" },
        { "label": "12 anos", "value": "12 anos" },
        { "label": "14 anos", "value": "14 anos" },
        { "label": "16 anos", "value": "16 anos" },
        { "label": "18 anos", "value": "18 anos" }
      ]
    },
    {
      "id": "evt_11_gratuito", "key": "gratuito", "name": "gratuito", "type": "switch", "label": "Evento gratuito",
      "grid": { "xs": 12, "sm": 12, "md": 6, "lg": 6, "xl": 6, "2xl": 6 },
      "behavior": {}, "validation": {}, "appearance": {}
    },
    {
      "id": "evt_12_artistas", "key": "artistas", "name": "artistas", "type": "list", "label": "Artistas e atrações",
      "grid": { "xs": 12, "sm": 12, "md": 12, "lg": 12, "xl": 12, "2xl": 12 },
      "behavior": {}, "validation": {}, "appearance": {},
      "itemLabel": "Atração",
      "itemFields": [
        {
          "id": "art_nome", "key": "nome", "name": "nome", "type": "text", "label": "Nome",
          "grid": { "xs": 12, "sm": 12, "md": 12, "lg": 12, "xl": 12, "2xl": 12 },
          "behavior": { "required": true }, "validation": {}, "appearance": {}
        }
      ]
    },
    {
      "id": "evt_13_secao_sessoes", "key": "secao_sessoes", "name": "secao_sessoes", "type": "heading", "label": "Horários",
      "grid": { "xs": 12, "sm": 12, "md": 12, "lg": 12, "xl": 12, "2xl": 12 },
      "behavior": {}, "validation": {}, "appearance": {}
    },
    {
      "id": "evt_14_sessoes", "key": "sessoes", "name": "sessoes", "type": "list", "label": "Horários",
      "grid": { "xs": 12, "sm": 12, "md": 12, "lg": 12, "xl": 12, "2xl": 12 },
      "behavior": {}, "validation": {}, "appearance": {},
      "itemLabel": "Horário",
      "itemFields": [
        {
          "id": "ses_abertura_portoes", "key": "abertura_portoes", "name": "abertura_portoes", "type": "time", "label": "Abertura dos portões",
          "grid": { "xs": 12, "sm": 12, "md": 6, "lg": 4, "xl": 4, "2xl": 4 },
          "behavior": {}, "validation": {}, "appearance": {}
        },
        {
          "id": "ses_hora_inicio", "key": "hora_inicio", "name": "hora_inicio", "type": "time", "label": "Início",
          "grid": { "xs": 12, "sm": 12, "md": 6, "lg": 4, "xl": 4, "2xl": 4 },
          "behavior": {}, "validation": {}, "appearance": {}
        },
        {
          "id": "ses_hora_fim", "key": "hora_fim", "name": "hora_fim", "type": "time", "label": "Término",
          "grid": { "xs": 12, "sm": 12, "md": 6, "lg": 4, "xl": 4, "2xl": 4 },
          "behavior": {}, "validation": {}, "appearance": {}
        }
      ]
    },
    {
      "id": "evt_07_secao_ingressos", "key": "secao_ingressos", "name": "secao_ingressos", "type": "heading", "label": "Ingressos",
      "grid": { "xs": 12, "sm": 12, "md": 12, "lg": 12, "xl": 12, "2xl": 12 },
      "behavior": {}, "validation": {}, "appearance": {}
    },
    {
      "id": "evt_08_ingressos", "key": "ingressos", "name": "ingressos", "type": "list", "label": "Tabela de ingressos",
      "grid": { "xs": 12, "sm": 12, "md": 12, "lg": 12, "xl": 12, "2xl": 12 },
      "behavior": {}, "validation": {}, "appearance": {},
      "itemLabel": "Ingresso",
      "itemFields": [
        {
          "id": "ing_titulo", "key": "titulo", "name": "titulo", "type": "text", "label": "Título",
          "grid": { "xs": 12, "sm": 12, "md": 6, "lg": 6, "xl": 6, "2xl": 6 },
          "behavior": { "required": true }, "validation": {}, "appearance": {}, "placeholder": "Ex.: Pista — 1º lote"
        },
        {
          "id": "ing_setor", "key": "setor", "name": "setor", "type": "text", "label": "Setor",
          "grid": { "xs": 12, "sm": 12, "md": 6, "lg": 6, "xl": 6, "2xl": 6 },
          "behavior": {}, "validation": {}, "appearance": {}, "placeholder": "Ex.: Pista, Camarote, Mesa"
        },
        {
          "id": "ing_tipo", "key": "tipo", "name": "tipo", "type": "select", "label": "Tipo",
          "grid": { "xs": 12, "sm": 12, "md": 4, "lg": 3, "xl": 3, "2xl": 3 },
          "behavior": {}, "validation": {}, "appearance": {},
          "options": [
            { "label": "Inteira", "value": "Inteira" },
            { "label": "Meia", "value": "Meia" },
            { "label": "Social", "value": "Social" },
            { "label": "Promocional", "value": "Promocional" },
            { "label": "Cortesia", "value": "Cortesia" }
          ]
        },
        {
          "id": "ing_pessoas", "key": "pessoas", "name": "pessoas", "type": "number", "label": "Pessoas",
          "grid": { "xs": 12, "sm": 12, "md": 4, "lg": 3, "xl": 3, "2xl": 3 },
          "behavior": {}, "validation": { "min": 1 }, "appearance": {}
        },
        {
          "id": "ing_lote", "key": "lote", "name": "lote", "type": "text", "label": "Lote",
          "grid": { "xs": 12, "sm": 12, "md": 4, "lg": 6, "xl": 6, "2xl": 6 },
          "behavior": {}, "validation": {}, "appearance": {}, "placeholder": "Ex.: 1º lote"
        },
        {
          "id": "ing_valor", "key": "valor", "name": "valor", "type": "currency", "label": "Valor",
          "grid": { "xs": 12, "sm": 12, "md": 6, "lg": 6, "xl": 6, "2xl": 6 },
          "behavior": {}, "validation": {}, "appearance": {}, "placeholder": "R$ 0,00"
        },
        {
          "id": "ing_comprar", "key": "comprar", "name": "comprar", "type": "text", "label": "Comprar",
          "grid": { "xs": 12, "sm": 12, "md": 6, "lg": 6, "xl": 6, "2xl": 6 },
          "behavior": {}, "validation": {}, "appearance": {}, "placeholder": "Ex.: comprar no site, link ou ponto de venda"
        }
      ]
    },
    {
      "id": "evt_21_secao_contato", "key": "secao_contato", "name": "secao_contato", "type": "heading", "label": "Contato",
      "grid": { "xs": 12, "sm": 12, "md": 12, "lg": 12, "xl": 12, "2xl": 12 },
      "behavior": {}, "validation": {}, "appearance": {}
    },
    {
      "id": "evt_22_contato_telefone", "key": "contato_telefone", "name": "contato_telefone", "type": "phone", "label": "Telefone",
      "grid": { "xs": 12, "sm": 12, "md": 6, "lg": 6, "xl": 6, "2xl": 6 },
      "behavior": {}, "validation": {}, "appearance": {}
    },
    {
      "id": "evt_23_contato_whatsapp", "key": "contato_whatsapp", "name": "contato_whatsapp", "type": "phone", "label": "WhatsApp",
      "grid": { "xs": 12, "sm": 12, "md": 6, "lg": 6, "xl": 6, "2xl": 6 },
      "behavior": {}, "validation": {}, "appearance": {}
    },
    {
      "id": "evt_24_contato_email", "key": "contato_email", "name": "contato_email", "type": "email", "label": "E-mail",
      "grid": { "xs": 12, "sm": 12, "md": 6, "lg": 6, "xl": 6, "2xl": 6 },
      "behavior": {}, "validation": {}, "appearance": {}
    }
  ]
}
$schema$::jsonb, true, u.uid
FROM (SELECT uid FROM auth.users WHERE is_root = true ORDER BY created_at ASC LIMIT 1) AS u
JOIN LATERAL (
    SELECT tn.uid FROM auth.tenants tn WHERE tn.owner_uid = u.uid ORDER BY tn.created_at ASC LIMIT 1
) AS t ON true
ON CONFLICT (tenant_id, form_key) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  schema = EXCLUDED.schema,
  active = true;

-- `eventos` e um GRUPO da taxonomia: vincula todas as categorias dele (e as de palco que tambem aparecem no grupo).
UPDATE public.categories SET form_key = 'eventos'
WHERE (category_group_id = (SELECT id FROM public.categories_group WHERE slug = 'eventos')
   OR slug IN ('teatro', 'humor-e-espetaculos'))
  AND (form_key IS NULL OR form_key = '');

COMMIT;

-- db/extras/eventos_expires_at_backfill.sql
-- "Acontece em" dos eventos = services.expires_at.
--
-- O formulário de eventos passou a pedir a data em que o evento acontece (passo "Detalhes do
-- evento", campo "Acontece em", kizuna.config.json stepProfiles["dynamic-form"].byGroup.eventos).
-- Esse campo grava services.expires_at: o instante é o FIM do dia escolhido, no horário de
-- Cuiabá (23:59:59.999), e é o que o card e o detalhe passam a mostrar.
--
-- Este script preenche o expires_at dos eventos que já existem a partir das respostas do
-- formulário (form_results.answers), com a mesma regra que o detalhe usa para saber se o evento
-- acabou (eventEnd): vale o ÚLTIMO dia conhecido entre
--   data_inicio, data_fim e sessoes[].data
-- Evento sem nenhuma dessas datas não é tocado (continua com o expires_at que tinha).
--
-- Só mexe em anúncios do grupo "eventos". Idempotente: rodar de novo recalcula o mesmo valor.
-- Uma transação só.
--   node kizuna-core/cli db run db/extras/eventos_expires_at_backfill.sql
-- Rode ANTES o bloco "Prévia" (no fim deste arquivo) para conferir o que vai mudar.

BEGIN;

-- 'AAAA-MM-DD' → date; data que não existe no calendário vira NULL em vez de derrubar o script.
CREATE FUNCTION pg_temp.dia_valido(p text) RETURNS date
LANGUAGE plpgsql IMMUTABLE AS $f$
BEGIN
  RETURN p::date;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$f$;

WITH datas AS (
  SELECT
    s.id AS service_id,
    -- dia (AAAA-MM-DD) de cada resposta de data; texto que não é data é ignorado
    ARRAY_REMOVE(
      ARRAY[
        CASE WHEN fr.answers->>'data_inicio' ~ '^\d{4}-\d{2}-\d{2}'
             THEN left(fr.answers->>'data_inicio', 10) END,
        CASE WHEN fr.answers->>'data_fim' ~ '^\d{4}-\d{2}-\d{2}'
             THEN left(fr.answers->>'data_fim', 10) END
      ]
      || COALESCE(
        (SELECT array_agg(left(sess->>'data', 10))
           FROM jsonb_array_elements(
                  CASE WHEN jsonb_typeof(fr.answers->'sessoes') = 'array'
                       THEN fr.answers->'sessoes' ELSE '[]'::jsonb END
                ) sess
          WHERE jsonb_typeof(sess) = 'object'
            AND sess->>'data' ~ '^\d{4}-\d{2}-\d{2}'),
        ARRAY[]::text[]
      ),
      NULL
    ) AS dias
  FROM public.services s
  JOIN public.categories_group g ON g.id = s.category_group_id AND g.slug = 'eventos'
  JOIN public.form_results fr
    ON fr.domain = 'service' AND fr.reference_id = s.id::text
),
ultimo AS (
  SELECT
    d.service_id,
    -- ISO de texto ordena como data; o maior é o último dia
    (SELECT max(x) FROM unnest(d.dias) x WHERE pg_temp.dia_valido(x) IS NOT NULL) AS dia
  FROM datas d
  WHERE cardinality(d.dias) > 0
),
novo AS (
  SELECT
    u.service_id,
    -- fim do dia no horário de Cuiabá; dia que o calendário não aceita (ex.: 2026-02-31) sai
    CASE WHEN pg_temp.dia_valido(u.dia) IS NOT NULL
         THEN ((pg_temp.dia_valido(u.dia) + 1)::timestamp AT TIME ZONE 'America/Cuiaba')
              - interval '1 millisecond'
    END AS expires_at
  FROM ultimo u
)
UPDATE public.services s
   SET expires_at = n.expires_at,
       updated_at = now()
  FROM novo n
 WHERE s.id = n.service_id
   AND n.expires_at IS NOT NULL
   AND s.expires_at IS DISTINCT FROM n.expires_at;

COMMIT;

-- ---------------------------------------------------------------------------
-- Prévia (rode antes do script; não altera nada): como o expires_at fica em cada evento.
--
-- SELECT s.id, s.title, s.expires_at AS atual,
--        fr.answers->>'data_inicio' AS data_inicio,
--        fr.answers->>'data_fim'    AS data_fim,
--        jsonb_path_query_array(fr.answers, '$.sessoes[*].data') AS sessoes
--   FROM public.services s
--   JOIN public.categories_group g ON g.id = s.category_group_id AND g.slug = 'eventos'
--   LEFT JOIN public.form_results fr
--     ON fr.domain = 'service' AND fr.reference_id = s.id::text
--  ORDER BY s.id;
--
-- Eventos sem nenhuma data nas respostas (não serão alterados):
--
-- SELECT s.id, s.title, s.expires_at
--   FROM public.services s
--   JOIN public.categories_group g ON g.id = s.category_group_id AND g.slug = 'eventos'
--   LEFT JOIN public.form_results fr
--     ON fr.domain = 'service' AND fr.reference_id = s.id::text
--  WHERE fr.answers->>'data_inicio' IS NULL
--    AND fr.answers->>'data_fim' IS NULL
--    AND jsonb_typeof(fr.answers->'sessoes') IS DISTINCT FROM 'array';

