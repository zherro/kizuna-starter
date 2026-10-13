-- Diagnóstico e publicação dos lugares importados (db/extras/lugares_import.sql).
--
-- Por que "não aparecem": o import grava os serviços com status 'pending' (fila de moderação).
-- A leitura pública (anon) só enxerga `active AND status = 'active'` (policy services_public_read
-- em kizuna-core/plugins/services/0001_services.sql), então listagem, busca e página do anúncio
-- ficam vazias até o status virar 'active'.
--
-- Uso (psql mostra os resultados dos SELECT):
--   psql "$DATABASE_URL" -f db/extras/lugares_publicar.sql
-- ou: node kizuna-core/cli db run db/extras/lugares_publicar.sql --db-url <url>
--
-- Idempotente. O bloco 3 publica: ao rodar, os 8 textos (ainda com pendências editoriais) ficam
-- visíveis ao público. Para só olhar, rode apenas os blocos 1 e 2 e aprove um a um no painel.

-- 1) Diagnóstico: o que foi importado, em qual status e com qual categoria
SELECT s.id,
       s.title,
       s.status,
       s.active,
       c.slug                                         AS categoria,
       (SELECT string_agg(cs.slug, ', ' ORDER BY cs.slug)
          FROM public.service_categories_sub scs
          JOIN public.categories_sub cs ON cs.id = scs.category_sub_id
         WHERE scs.service_id = s.id)                 AS subcategorias,
       (SELECT string_agg(cs.slug || CASE WHEN cs.active THEN '' ELSE ' (INATIVA)' END, ', ')
          FROM public.service_categories_sub scs
          JOIN public.categories_sub cs ON cs.id = scs.category_sub_id
         WHERE scs.service_id = s.id AND NOT cs.active) AS subs_inativas,
       (SELECT count(*) FROM public.service_addresses a WHERE a.service_id = s.id) AS enderecos,
       (SELECT a.city_ibge FROM public.service_addresses a
         WHERE a.service_id = s.id ORDER BY a.is_primary DESC LIMIT 1)             AS ibge,
       jsonb_array_length(coalesce(s.extras->'images', '[]'::jsonb))                AS fotos
  FROM public.services s
  JOIN public.categories c ON c.id = s.category_id
 WHERE s.extras->'origem'->>'fonte' = 'content/lugares'
 ORDER BY s.title;

-- 2) Categorias/subcategorias usadas pelos lugares e se estão ativas
SELECT DISTINCT c.slug AS categoria, c.active AS categoria_ativa,
       cs.slug AS subcategoria, cs.active AS sub_ativa
  FROM public.services s
  JOIN public.categories c           ON c.id = s.category_id
  LEFT JOIN public.service_categories_sub scs ON scs.service_id = s.id
  LEFT JOIN public.categories_sub cs ON cs.id = scs.category_sub_id
 WHERE s.extras->'origem'->>'fonte' = 'content/lugares'
 ORDER BY 1, 3;

-- 3) Publicar: ativa a subcategoria nova e muda os lugares pendentes para 'active'
BEGIN;

UPDATE public.categories_sub
   SET active = true, updated_at = now()
 WHERE slug = 'casas-de-festas' AND NOT active;

UPDATE public.services
   SET status = 'active', updated_at = now()
 WHERE extras->'origem'->>'fonte' = 'content/lugares'
   AND active
   AND status = 'pending';

COMMIT;

-- 4) Conferência (deve listar os 8 como 'active')
SELECT title, status FROM public.services
 WHERE extras->'origem'->>'fonte' = 'content/lugares' ORDER BY title;
