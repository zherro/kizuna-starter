-- Diagnóstico de PERFORMANCE da /busca (somente leitura: nenhum INSERT/UPDATE/DELETE/DDL).
-- Rode no banco de produção, de preferência fora do pico:
--   DBeaver: abra este arquivo, selecione UMA consulta por vez (entre os comentários "-- ===") e rode com Ctrl+Enter.
-- No resultado do EXPLAIN, copie todas as linhas da coluna "QUERY PLAN" e mande de volta.
-- EXPLAIN ANALYZE de SELECT executa de verdade, mas só lê.


-- === 0. Volume das tabelas que a busca toca ===
SELECT relname,
       n_live_tup,
       n_dead_tup,
       seq_scan,
       idx_scan,
       last_autovacuum,
       last_autoanalyze
FROM pg_stat_user_tables
WHERE relname IN ('services','service_addresses','categories','categories_group','categories_group_link',
                  'service_categories_sub','categories_sub','user_data','review_stats','form_results')
ORDER BY n_live_tup DESC;

-- === 1. Índices existentes nessas tabelas (e quanto são usados) ===
SELECT s.relname AS tabela, s.indexrelname AS indice, s.idx_scan,
       pg_size_pretty(pg_relation_size(s.indexrelid)) AS tamanho,
       i.indexdef
FROM pg_stat_user_indexes s
JOIN pg_indexes i ON i.indexname = s.indexrelname AND i.schemaname = s.schemaname
WHERE s.relname IN ('services','service_addresses','user_data','review_stats','form_results',
                    'service_categories_sub','categories_group_link')
ORDER BY s.relname, s.idx_scan DESC;

-- === 2. Extensões (precisa de unaccent; pg_trgm ajuda o ILIKE) ===
SELECT extname, extversion FROM pg_extension WHERE extname IN ('unaccent','pg_trgm','pg_stat_statements');

-- === 3. Top consultas por tempo total (só se pg_stat_statements existir) ===
-- Se der erro "relation does not exist", ignore: a extensão não está ligada.
SELECT calls,
       round(total_exec_time::numeric/1000, 1) AS total_s,
       round(mean_exec_time::numeric, 1)       AS media_ms,
       round(max_exec_time::numeric, 1)        AS max_ms,
       left(regexp_replace(query, '\s+', ' ', 'g'), 140) AS query
FROM pg_stat_statements
WHERE query ILIKE '%fn_search_services%' OR query ILIKE '%services%'
ORDER BY total_exec_time DESC
LIMIT 15;

-- ---------------------------------------------------------------------------------------------
-- A tela /busca sem filtro dispara fn_search_services várias vezes (uma por carrossel de
-- `search.browseGroups` + a lista principal). Abaixo, as mesmas chamadas, com o IBGE de Cuiabá e
-- a região Grande Cuiabá (kizuna.config.json → regions).
-- O EXPLAIN de função plpgsql mostra só o tempo TOTAL da chamada (o plano interno está na seção 7).
-- ---------------------------------------------------------------------------------------------

-- === 4a. Lista principal: Cuiabá + região, sem grupo, ordem relevância (pág. 0, 20) ===
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM public.fn_search_services(
  p_state => NULL, p_city_id => NULL, p_group_category_slug => NULL,
  p_seed => 0.5, p_page => 0, p_page_size => 20,
  p_city_ibge => '5103403',
  p_city_ibges => ARRAY['5103403','5108402','5103007']);

-- === 4b. Carrossel "Eventos e cultura" (grupo eventos, ordem por data, com vencidos 2 dias) ===
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM public.fn_search_services(
  p_state => NULL, p_city_id => NULL, p_group_category_slug => 'eventos',
  p_seed => 0.5, p_page => 0, p_page_size => 20,
  p_city_ibge => '5103403',
  p_city_ibges => ARRAY['5103403','5108402','5103007'],
  p_order => 'expires_at:asc',
  p_expired_grace => '{"eventos": 2}'::jsonb);

-- === 4c. Carrossel "cultura-e-arte" ===
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM public.fn_search_services(
  p_state => NULL, p_city_id => NULL, p_group_category_slug => 'cultura-e-arte',
  p_seed => 0.5, p_page => 0, p_page_size => 20,
  p_city_ibge => '5103403',
  p_city_ibges => ARRAY['5103403','5108402','5103007']);

-- === 4d. Carrossel "cinema" ===
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM public.fn_search_services(
  p_state => NULL, p_city_id => NULL, p_group_category_slug => 'cinema',
  p_seed => 0.5, p_page => 0, p_page_size => 20,
  p_city_ibge => '5103403',
  p_city_ibges => ARRAY['5103403','5108402','5103007']);

-- === 4e. Carrossel "noticias" ===
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM public.fn_search_services(
  p_state => NULL, p_city_id => NULL, p_group_category_slug => 'noticias',
  p_seed => 0.5, p_page => 0, p_page_size => 20,
  p_city_ibge => '5103403',
  p_city_ibges => ARRAY['5103403','5108402','5103007']);

-- === 4f. Carrossel "Bares e lugares" (bares-e-vida-noturna) ===
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM public.fn_search_services(
  p_state => NULL, p_city_id => NULL, p_group_category_slug => 'bares-e-vida-noturna',
  p_seed => 0.5, p_page => 0, p_page_size => 20,
  p_city_ibge => '5103403',
  p_city_ibges => ARRAY['5103403','5108402','5103007']);

-- === 4g. Carrossel "lugares" ===
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM public.fn_search_services(
  p_state => NULL, p_city_id => NULL, p_group_category_slug => 'lugares',
  p_seed => 0.5, p_page => 0, p_page_size => 20,
  p_city_ibge => '5103403',
  p_city_ibges => ARRAY['5103403','5108402','5103007']);

-- === 5. Busca por texto (o caso mais caro: tsvector + unaccent + ILIKE %x% sem índice) ===
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM public.fn_search_services(
  p_state => NULL, p_city_id => NULL, p_group_category_slug => NULL,
  p_query => 'pizza', p_seed => 0.5, p_page => 0, p_page_size => 20,
  p_city_ibge => '5103403',
  p_city_ibges => ARRAY['5103403','5108402','5103007']);

-- === 6. Quantos anúncios entram no CTE materializado (o que o ORDER BY/LIMIT precisa ordenar) ===
SELECT count(*) AS ativos_total,
       count(*) FILTER (WHERE expires_at IS NULL OR expires_at > now()) AS nao_expirados
FROM public.services
WHERE active AND status = 'active';

-- === 7. Plano INTERNO: o filtro de cidade/ativo do CTE (aproximação da query do RETURN QUERY) ===
-- Mesmos predicados do services_filtered (ativo, status, validade, local), com os joins LATERAL
-- que mais custam (user_data do dono, review_stats, endereços). Sem grupo: caso "lista principal".
EXPLAIN (ANALYZE, BUFFERS)
SELECT s.id, s.uid, s.title, c.slug, prov.prov_city, rs.average_rating
FROM public.services s
LEFT JOIN public.categories c ON c.id = s.category_id
LEFT JOIN LATERAL (
  SELECT ud.city AS prov_city, ud.city_ibge AS prov_city_ibge
  FROM public.user_data ud
  WHERE ud.tenant_id = s.tenant_id AND ud.active = true
  ORDER BY ud.created_at LIMIT 1
) prov ON true
LEFT JOIN public.review_stats rs ON rs.domain = 'service' AND rs.reference_id = s.id::text
WHERE s.active = true
  AND s.status = 'active'
  AND (s.expires_at IS NULL OR s.expires_at > now())
  AND (
    s.service_location = 'remoto'
    OR EXISTS (SELECT 1 FROM public.service_addresses a
               WHERE a.service_id = s.id AND a.active
                 AND a.city_ibge = ANY (ARRAY['5103403','5108402','5103007']))
    OR (NOT EXISTS (SELECT 1 FROM public.service_addresses a0 WHERE a0.service_id = s.id AND a0.active)
        AND prov.prov_city_ibge = ANY (ARRAY['5103403','5108402','5103007']))
  );

-- === 8. Candidatos a índice: o que falta? (colunas dessas junções sem índice) ===
SELECT t.relname AS tabela, a.attname AS coluna
FROM pg_class t
JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum > 0 AND NOT a.attisdropped
WHERE t.relname IN ('services','service_addresses','user_data','review_stats')
  AND t.relnamespace = 'public'::regnamespace
  AND a.attname IN ('tenant_id','service_id','city_ibge','category_id','category_group_id',
                    'reference_id','domain','active','status','expires_at')
  AND NOT EXISTS (
    SELECT 1 FROM pg_index i
    WHERE i.indrelid = t.oid AND a.attnum = ANY (i.indkey::int2[])
  )
ORDER BY 1, 2;
