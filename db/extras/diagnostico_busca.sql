-- Diagnóstico: por que um anúncio não aparece na busca (/busca → public.fn_search_services).
-- Troque o título na linha "\set titulo" e rode no banco de produção:
--   psql "$DATABASE_URL" -f db/extras/diagnostico_busca.sql
-- Sem psql, troque :'titulo' pelo título entre aspas simples.
-- Cada coluna "ok_*" é uma regra da busca: o anúncio só aparece se TODAS forem true.

\set titulo '%CPM 22%'

SELECT
  s.id,
  s.uid,
  s.title,
  -- 1) publicado
  s.active                                            AS ok_ativo,
  s.status,
  s.status = 'active'                                 AS ok_status,      -- pending = aguardando aprovação
  s.expires_at,
  (s.expires_at IS NULL OR s.expires_at > now())      AS ok_nao_expirou,
  -- 2) grupo / categoria (filtro "Eventos")
  cg.slug                                             AS grupo,
  cg.active                                           AS ok_grupo_ativo,
  c.slug                                              AS categoria,
  c.category_group_id = s.category_group_id           AS cat_bate_grupo,
  -- 3) cidade: endereço ativo em Cuiabá (5103403), ou sem endereço e o perfil do dono em Cuiabá,
  --    ou atendimento remoto
  s.service_location,
  (SELECT count(*) FROM public.service_addresses a WHERE a.service_id = s.id AND a.active) AS enderecos_ativos,
  (SELECT string_agg(coalesce(a.city, '?') || '/' || coalesce(a.city_ibge, 'SEM IBGE'), ', ')
     FROM public.service_addresses a WHERE a.service_id = s.id AND a.active)              AS cidades_endereco,
  (
    s.service_location = 'remoto'
    OR EXISTS (SELECT 1 FROM public.service_addresses a
               WHERE a.service_id = s.id AND a.active AND a.city_ibge = '5103403')
    OR (NOT EXISTS (SELECT 1 FROM public.service_addresses a0 WHERE a0.service_id = s.id AND a0.active)
        AND (SELECT ud.city_ibge FROM public.user_data ud
             WHERE ud.tenant_id = s.tenant_id AND ud.active ORDER BY ud.created_at LIMIT 1) = '5103403')
  )                                                   AS ok_cidade_cuiaba,
  -- 4) a própria busca acha? (Cuiabá, sem outro filtro; página 0, até 1000 itens)
  EXISTS (
    SELECT 1 FROM public.fn_search_services(
      NULL, NULL, NULL, NULL, NULL, NULL, 0.5, 0, 1000, '5103403',
      NULL, NULL, NULL, NULL, NULL, NULL) r
    WHERE r.uid = s.uid
  )                                                   AS aparece_busca_cuiaba,
  -- 5) e pelo texto do título?
  EXISTS (
    SELECT 1 FROM public.fn_search_services(
      NULL, NULL, NULL, NULL, NULL, s.title, 0.5, 0, 1000, '5103403',
      NULL, NULL, NULL, NULL, NULL, NULL) r
    WHERE r.uid = s.uid
  )                                                   AS aparece_buscando_titulo,
  s.created_at,
  s.updated_at
FROM public.services s
LEFT JOIN public.categories_group cg ON cg.id = s.category_group_id
LEFT JOIN public.categories c        ON c.id  = s.category_id
WHERE s.title ILIKE :'titulo'
ORDER BY s.created_at DESC;
